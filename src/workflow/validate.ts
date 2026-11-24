import type { NodeRegistry } from "../nodes/registry.ts";
import type { Edge, Graph, GraphNode, Port } from "./schema.ts";
import { isScriptNode } from "./schema.ts";

export interface Diagnostic {
  readonly code: string;
  readonly severity: "info" | "warning" | "error";
  readonly nodeId?: string;
  readonly message: string;
}

const LUA_RESERVED = new Set([
  "and", "break", "do", "else", "elseif", "end", "false", "for", "function", "goto", "if",
  "in", "local", "nil", "not", "or", "repeat", "return", "then", "true", "until", "while",
]);

export function isLuaIdentifier(name: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) && !LUA_RESERVED.has(name);
}

function findPort(registry: NodeRegistry, node: GraphNode, portId: string): Port | undefined {
  return registry.portsOf(node).find((port) => port.id === portId);
}

function typesCompatible(from: string, to: string): boolean {
  return from === to || from === "any" || to === "any";
}

/** Checks one edge against the graph it would be part of (excluding itself). */
export function validateEdge(registry: NodeRegistry, graph: Graph, edge: Edge): Diagnostic | null {
  const fromNode = graph.nodes.find((node) => node.id === edge.from.nodeId);
  const toNode = graph.nodes.find((node) => node.id === edge.to.nodeId);
  if (fromNode === undefined || toNode === undefined) {
    return { code: "edge.missingNode", severity: "error", message: "连线端点的节点不存在。" };
  }
  if (fromNode.id === toNode.id) {
    return { code: "edge.selfLoop", severity: "error", nodeId: toNode.id, message: "节点不能连接到自身。" };
  }

  const fromPort = findPort(registry, fromNode, edge.from.portId);
  const toPort = findPort(registry, toNode, edge.to.portId);
  if (fromPort === undefined || toPort === undefined) {
    return { code: "edge.missingPort", severity: "error", nodeId: toNode.id, message: "连线端口不存在。" };
  }
  if (fromPort.direction !== "output" || toPort.direction !== "input") {
    return { code: "edge.direction", severity: "error", nodeId: toNode.id, message: "连线必须从输出端口连到输入端口。" };
  }
  if (fromPort.kind !== toPort.kind) {
    return { code: "edge.kind", severity: "error", nodeId: toNode.id, message: "执行端口只能连接执行端口，数据端口只能连接数据端口。" };
  }
  if (fromPort.kind === "data" && !typesCompatible(fromPort.type, toPort.type)) {
    return {
      code: "edge.type",
      severity: "error",
      nodeId: toNode.id,
      message: `类型不匹配：${fromPort.type} 不能连接到 ${toPort.type}。`,
    };
  }

  const others = graph.edges.filter((other) => other !== edge);
  if (fromPort.kind === "data" && others.some((other) => sameEndpoint(other.to, edge.to))) {
    return { code: "edge.multipleInputs", severity: "error", nodeId: toNode.id, message: `输入 ${toPort.name} 已有连线。` };
  }
  if (fromPort.kind === "flow" && others.some((other) => sameEndpoint(other.from, edge.from))) {
    return { code: "edge.multipleFlowOutputs", severity: "error", nodeId: fromNode.id, message: `执行出口 ${fromPort.name} 已有连线。` };
  }

  return null;
}

function sameEndpoint(a: Edge["from"], b: Edge["from"]): boolean {
  return a.nodeId === b.nodeId && a.portId === b.portId;
}

function validateScriptSignature(node: GraphNode): Diagnostic[] {
  if (!isScriptNode(node)) {
    return [];
  }

  const diagnostics: Diagnostic[] = [];
  const groups: [string, readonly Port[]][] = [["输入", node.inputs], ["输出", node.outputs]];

  for (const [label, ports] of groups) {
    const seen = new Set<string>();
    for (const port of ports) {
      if (!isLuaIdentifier(port.name)) {
        diagnostics.push({ code: "script.portName", severity: "error", nodeId: node.id, message: `${label}名 “${port.name}” 不是合法的 Lua 标识符。` });
      }
      if (seen.has(port.name)) {
        diagnostics.push({ code: "script.duplicatePort", severity: "error", nodeId: node.id, message: `${label}名 “${port.name}” 重复。` });
      }
      seen.add(port.name);
    }
  }

  return diagnostics;
}

export function validateGraph(registry: NodeRegistry, graph: Graph): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  for (const node of graph.nodes) {
    if (registry.get(node.type) === undefined) {
      diagnostics.push({ code: "node.unknown", severity: "error", nodeId: node.id, message: `未知节点类型 ${node.type}，已原样保留，不能导出。` });
    }
    if (node.type === "core.customScript" && !isScriptNode(node)) {
      diagnostics.push({ code: "script.malformed", severity: "error", nodeId: node.id, message: "自定义脚本节点字段不完整，已原样保留。" });
    }
    diagnostics.push(...validateScriptSignature(node));
  }

  for (const edge of graph.edges) {
    const unknownEnd = [edge.from.nodeId, edge.to.nodeId].some((id) => {
      const node = graph.nodes.find((candidate) => candidate.id === id);
      return node !== undefined && registry.get(node.type) === undefined;
    });
    if (unknownEnd) {
      continue; // reported on the unknown node; the edge is preserved as-is
    }

    const diagnostic = validateEdge(registry, graph, edge);
    if (diagnostic !== null) {
      diagnostics.push(diagnostic);
    }
  }

  return diagnostics;
}
