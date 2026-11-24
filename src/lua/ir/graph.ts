import type { NodeRegistry } from "../../nodes/registry.ts";
import { isScriptNode, type Graph, type GraphNode, type LuaLiteral, type ScriptNode } from "../../workflow/schema.ts";
import type { Diagnostic } from "../../workflow/validate.ts";
import type { Block, Expr, Program, ScriptFunction, Statement, TopLevelItem } from "./model.ts";

export const EVENT_NODE_TYPES: Readonly<Record<string, string>> = {
  "core.event.tick": "TICK",
  "core.event.render": "RENDER",
};

const DEFAULT_EVENT_PARAMS: Readonly<Record<string, readonly string[]>> = {
  TICK: [],
  RENDER: ["delta"],
};

export function scriptFunctionName(nodeId: string): string {
  return `__omm_fn_${nodeId.replace(/[^A-Za-z0-9_]/g, "_")}`;
}

export interface GraphToIrResult {
  readonly program: Program;
  readonly diagnostics: readonly Diagnostic[];
}

/** Variables visible in one lexical block: `nodeId:portId` → Lua name. */
type Scope = Map<string, string>;

function key(nodeId: string, portId: string): string {
  return `${nodeId}:${portId}`;
}

function orderOf(node: GraphNode): number {
  return typeof node.order === "number" ? node.order : Number.POSITIVE_INFINITY;
}

/**
 * Lowers a graph to IR following execution edges. Data inputs resolve by
 * symbol visibility; value-mode script nodes are materialized once in the
 * block where they are first needed.
 */
export function graphToIr(registry: NodeRegistry, graph: Graph): GraphToIrResult {
  const diagnostics: Diagnostic[] = [];
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const functions = new Map<string, ScriptFunction>();
  /** Definitions created since the enclosing top-level statement started. */
  let pendingDefinitions: Statement[] = [];
  const materializedAnywhere = new Set<string>();
  const reached = new Set<string>();
  let variableCounter = 0;

  const error = (code: string, message: string, nodeId?: string) => {
    diagnostics.push({ code, severity: "error", nodeId, message });
  };

  const freshName = (hint: string) => {
    variableCounter += 1;
    const safe = hint.replace(/[^A-Za-z0-9_]/g, "_");
    return `__omm_v${variableCounter}_${safe}`;
  };

  const lookup = (scopes: Scope[], nodeId: string, portId: string): string | undefined => {
    for (let index = scopes.length - 1; index >= 0; index--) {
      const name = scopes[index]!.get(key(nodeId, portId));
      if (name !== undefined) {
        return name;
      }
    }
    return undefined;
  };

  const ensureFunction = (node: ScriptNode) => {
    if (!functions.has(node.id)) {
      const fn: ScriptFunction = {
        nodeId: node.id,
        revision: node.revision,
        name: scriptFunctionName(node.id),
        params: node.inputs.map((port) => port.name),
        source: node.source,
      };
      functions.set(node.id, fn);
      pendingDefinitions.push({ kind: "function", nodeId: node.id, fn });
    }
  };

  /** Emits a call to a script node into `out`, registering its outputs in the current scope. */
  const emitScriptCall = (node: ScriptNode, scopes: Scope[], out: Statement[]) => {
    ensureFunction(node);
    const args = node.inputs.map((port) => resolveInput(node, port.id, port.defaultValue ?? null, scopes, out));
    const results = node.outputs.map((port) => freshName(port.name));
    const scope = scopes[scopes.length - 1]!;
    node.outputs.forEach((port, index) => scope.set(key(node.id, port.id), results[index]!));
    out.push({ kind: "call", nodeId: node.id, functionName: scriptFunctionName(node.id), args, results });
  };

  function resolveInput(
    consumer: GraphNode,
    portId: string,
    fallback: LuaLiteral,
    scopes: Scope[],
    out: Statement[],
  ): Expr {
    const edge = graph.edges.find((candidate) => candidate.to.nodeId === consumer.id && candidate.to.portId === portId);
    if (edge === undefined) {
      return { kind: "literal", value: fallback };
    }

    const source = nodes.get(edge.from.nodeId);
    if (source === undefined) {
      error("export.missingNode", "连线来源节点不存在。", consumer.id);
      return { kind: "literal", value: null };
    }

    if (source.type === "core.constant.number") {
      const value = typeof source.value === "number" && Number.isFinite(source.value) ? source.value : null;
      if (value === null) {
        error("export.invalidConstant", "数值常量无效。", source.id);
      }
      return { kind: "literal", value };
    }

    const visible = lookup(scopes, source.id, edge.from.portId);
    if (visible !== undefined) {
      return { kind: "name", name: visible };
    }

    if (isScriptNode(source) && source.mode === "value") {
      if (materializedAnywhere.has(source.id)) {
        error("export.notDominated", "取值节点的结果在此处不可见（位于其他分支），请调整连线。", consumer.id);
        return { kind: "literal", value: null };
      }
      materializedAnywhere.add(source.id);
      reached.add(source.id);
      emitScriptCall(source, scopes, out);
      return { kind: "name", name: lookup(scopes, source.id, edge.from.portId)! };
    }

    error("export.notVisible", "输入来自尚未执行或不在当前作用域的节点。", consumer.id);
    return { kind: "literal", value: null };
  }

  const nextNode = (nodeId: string, portId: string): GraphNode | undefined => {
    const edge = graph.edges.find((candidate) => candidate.from.nodeId === nodeId && candidate.from.portId === portId);
    return edge === undefined ? undefined : nodes.get(edge.to.nodeId);
  };

  /** Walks the flow chain starting after (nodeId, portId). */
  const lowerChain = (
    nodeId: string,
    portId: string,
    scopes: Scope[],
    loopDepth: number,
    path: Set<string>,
    topLevel = false,
  ): Block => {
    const out: Statement[] = [];
    let current = nextNode(nodeId, portId);

    while (current !== undefined) {
      const statementStart = out.length;
      if (topLevel) {
        pendingDefinitions = [];
      }
      if (path.has(current.id)) {
        error("export.flowCycle", "执行连线形成了环。", current.id);
        break;
      }
      path.add(current.id);
      reached.add(current.id);
      const node: GraphNode = current;

      if (node.type === "core.rawLua") {
        out.push({
          kind: "raw",
          nodeId: node.id,
          source: typeof node.source === "string" ? node.source : "",
          verbatim: node.verbatim === true,
        });
      } else if (isScriptNode(node) && node.mode === "statement") {
        emitScriptCall(node, scopes, out);
      } else if (node.type === "core.if") {
        const condition = resolveInput(node, "condition", null, scopes, out);
        const thenBlock = lowerChain(node.id, "then", [...scopes, new Map()], loopDepth, new Set(path));
        const elseBlock = lowerChain(node.id, "else", [...scopes, new Map()], loopDepth, new Set(path));
        out.push({ kind: "if", nodeId: node.id, condition, then: thenBlock, else: elseBlock });
      } else if (node.type === "core.for.numeric") {
        const start = resolveInput(node, "start", 1, scopes, out);
        const limit = resolveInput(node, "limit", 1, scopes, out);
        const hasStep = graph.edges.some((edge) => edge.to.nodeId === node.id && edge.to.portId === "step");
        const step = hasStep ? resolveInput(node, "step", 1, scopes, out) : null;
        if (step?.kind === "literal" && step.value === 0) {
          error("export.zeroStep", "数值 for 的步长不能为 0。", node.id);
        }
        const index = freshName("i");
        const bodyScope: Scope = new Map([[key(node.id, "index"), index]]);
        const body = lowerChain(node.id, "body", [...scopes, bodyScope], loopDepth + 1, new Set(path));
        out.push({ kind: "numericFor", nodeId: node.id, index, start, limit, step, body });
      } else if (node.type === "core.for.ipairs" || node.type === "core.for.pairs") {
        const source = resolveInput(node, "source", null, scopes, out);
        const keyName = freshName(node.type === "core.for.ipairs" ? "i" : "k");
        const valueName = freshName("v");
        const bodyScope: Scope = new Map([
          [key(node.id, "key"), keyName],
          [key(node.id, "value"), valueName],
        ]);
        const body = lowerChain(node.id, "body", [...scopes, bodyScope], loopDepth + 1, new Set(path));
        out.push({
          kind: "genericFor",
          nodeId: node.id,
          iterator: node.type === "core.for.ipairs" ? "ipairs" : "pairs",
          key: keyName,
          value: valueName,
          source,
          body,
        });
      } else if (node.type === "core.break") {
        if (loopDepth === 0) {
          error("export.breakOutsideLoop", "break 只能在循环体内使用。", node.id);
        }
        out.push({ kind: "break", nodeId: node.id });
        break;
      } else {
        const known = registry.get(node.type) !== undefined;
        error(
          known ? "export.notExportable" : "export.unknownNode",
          known ? `节点「${registry.get(node.type)!.title}」尚未有经审核的 Lua 生成规则，不能导出。` : `未知节点 ${node.type} 不能导出。`,
          node.id,
        );
        break;
      }

      if (topLevel && pendingDefinitions.length > 0) {
        out.splice(statementStart, 0, ...pendingDefinitions);
        pendingDefinitions = [];
      }
      current = nextNode(node.id, "exec_out");
    }
    return out;
  };

  const items: TopLevelItem[] = [];
  const entries = graph.nodes
    .filter((node) => node.type === "core.event.load" || EVENT_NODE_TYPES[node.type] !== undefined)
    .sort((a, b) => orderOf(a) - orderOf(b) || (a.position?.y ?? 0) - (b.position?.y ?? 0));

  for (const entry of entries) {
    reached.add(entry.id);
    const event = EVENT_NODE_TYPES[entry.type];
    if (event === undefined) {
      const statements = lowerChain(entry.id, "exec_out", [new Map()], 0, new Set([entry.id]), true);
      // Imported raw statements carry their own order so interleaving with events is kept.
      splitLoadBlock(statements, nodes, orderOf(entry), items);
      continue;
    }

    const params = Array.isArray(entry.params) ? (entry.params as string[]) : [...DEFAULT_EVENT_PARAMS[event]!];
    const eventScope: Scope = new Map();
    if (params[0] !== undefined) {
      eventScope.set(key(entry.id, "delta"), params[0]);
    }
    pendingDefinitions = [];
    const body = lowerChain(entry.id, "exec_out", [eventScope], 0, new Set([entry.id]));
    if (pendingDefinitions.length > 0) {
      items.push({ kind: "block", order: orderOf(entry), statements: pendingDefinitions });
      pendingDefinitions = [];
    }
    items.push({
      kind: "event",
      nodeId: entry.id,
      order: orderOf(entry),
      event,
      params,
      header: typeof entry.header === "string" ? entry.header : null,
      footer: typeof entry.footer === "string" ? entry.footer : null,
      body,
    });
  }

  for (const node of graph.nodes) {
    const definition = registry.get(node.type);
    const hasFlowInput = definition?.ports(node).some((port) => port.kind === "flow" && port.direction === "input");
    if (hasFlowInput && !reached.has(node.id)) {
      diagnostics.push({ code: "export.unreached", severity: "warning", nodeId: node.id, message: "节点未接入任何事件，不会导出。" });
    }
  }

  // Stable sort keeps equal orders in graph order.
  const sorted = items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => a.item.order - b.item.order || a.index - b.index)
    .map(({ item }) => item);

  const load = graph.nodes.find((node) => node.type === "core.event.load");
  const trailer = typeof load?.trailer === "string" ? load.trailer : null;
  return { program: { items: sorted, trailer }, diagnostics };
}

/** Splits the load chain at imported raw statements that carry an `order`. */
function splitLoadBlock(
  statements: Block,
  nodes: Map<string, GraphNode>,
  entryOrder: number,
  items: TopLevelItem[],
): void {
  let current: Statement[] = [];
  let currentOrder = entryOrder === Number.POSITIVE_INFINITY ? Number.NEGATIVE_INFINITY : entryOrder;

  for (const statement of statements) {
    const order = nodes.get(statement.nodeId)?.order;
    if (typeof order === "number" && order !== currentOrder) {
      if (current.length > 0) {
        items.push({ kind: "block", order: currentOrder, statements: current });
      }
      current = [];
      currentOrder = order;
    }
    current.push(statement);
  }
  if (current.length > 0) {
    items.push({ kind: "block", order: currentOrder, statements: current });
  }
}
