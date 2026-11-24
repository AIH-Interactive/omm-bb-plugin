import type { NodeRegistry } from "../nodes/registry.ts";
import type {
  ControlDefinition,
  Edge,
  Endpoint,
  Graph,
  GraphDocument,
  GraphNode,
  Position,
  ScriptNode,
} from "./schema.ts";
import { isScriptNode } from "./schema.ts";
import { validateEdge, type Diagnostic } from "./validate.ts";

export type ScriptChanges = Partial<Pick<ScriptNode, "mode" | "inputs" | "outputs" | "source">>;

export type Command =
  | { readonly kind: "addNode"; readonly graphId: string; readonly node: GraphNode }
  | { readonly kind: "removeNodes"; readonly graphId: string; readonly nodeIds: readonly string[] }
  | {
      readonly kind: "moveNodes";
      readonly graphId: string;
      readonly positions: Readonly<Record<string, Position>>;
      /** Consecutive moves with the same key merge into one undo step (one drag). */
      readonly mergeKey?: string;
    }
  | { readonly kind: "connect"; readonly graphId: string; readonly edge: Edge }
  | { readonly kind: "disconnect"; readonly graphId: string; readonly edge: Edge }
  | {
      readonly kind: "updateScript";
      readonly graphId: string;
      readonly nodeId: string;
      readonly changes: ScriptChanges;
    }
  | {
      readonly kind: "setNodeField";
      readonly graphId: string;
      readonly nodeId: string;
      readonly field: string;
      readonly value: unknown;
    }
  | { readonly kind: "addControl"; readonly control: ControlDefinition }
  | {
      readonly kind: "updateControl";
      readonly controlId: string;
      readonly changes: Partial<ControlDefinition>;
    }
  | { readonly kind: "removeControl"; readonly controlId: string }
  /** Replaces a whole graph (Lua import); undoable like any other command. */
  | { readonly kind: "replaceGraph"; readonly graph: Graph }
  /** Sets a top-level document field other than the schema fields. */
  | { readonly kind: "setDocumentField"; readonly field: string; readonly value: unknown }
  /** Applied atomically: one undo step, nothing applied if any part fails. */
  | { readonly kind: "transaction"; readonly label: string; readonly commands: readonly Command[] };

type GraphCommand = Extract<Command, { graphId: string }>;

const PROTECTED_DOCUMENT_FIELDS = new Set(["schemaVersion", "targetProfile", "graphs", "controls"]);

export type ApplyResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly diagnostic: Diagnostic };

class CommandError extends Error {
  readonly diagnostic: Diagnostic;

  constructor(diagnostic: Diagnostic) {
    super(diagnostic.message);
    this.diagnostic = diagnostic;
  }
}

function fail(code: string, message: string, nodeId?: string): never {
  throw new CommandError({ code, severity: "error", message, nodeId });
}

function sameEndpoint(a: Endpoint, b: Endpoint): boolean {
  return a.nodeId === b.nodeId && a.portId === b.portId;
}

function sameEdge(a: Edge, b: Edge): boolean {
  return sameEndpoint(a.from, b.from) && sameEndpoint(a.to, b.to);
}

interface UndoEntry {
  readonly document: GraphDocument;
  readonly mergeKey?: string;
}

/** Graph state with snapshot-based undo; every applied command is one undo step. */
export class GraphStore {
  document: GraphDocument;
  private readonly registry: NodeRegistry;
  private readonly undoStack: UndoEntry[] = [];
  private redoStack: GraphDocument[] = [];
  private readonly listeners = new Set<() => void>();

  constructor(registry: NodeRegistry, document: GraphDocument) {
    this.registry = registry;
    this.document = document;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Replaces the document (e.g. project switch) and clears history. */
  reset(document: GraphDocument): void {
    this.document = document;
    this.undoStack.length = 0;
    this.redoStack = [];
    this.emit();
  }

  apply(command: Command): ApplyResult {
    let next: GraphDocument;
    try {
      next = this.reduce(this.document, command);
    } catch (error) {
      if (error instanceof CommandError) {
        return { ok: false, diagnostic: error.diagnostic };
      }
      throw error;
    }

    const mergeKey = command.kind === "moveNodes" ? command.mergeKey : undefined;
    const last = this.undoStack.at(-1);
    const mergesWithLast =
      mergeKey !== undefined && last?.mergeKey === mergeKey && this.redoStack.length === 0;
    if (!mergesWithLast) {
      this.undoStack.push({ document: this.document, mergeKey });
    }

    this.redoStack = [];
    this.document = next;
    this.emit();
    return { ok: true };
  }

  undo(): boolean {
    const entry = this.undoStack.pop();
    if (entry === undefined) {
      return false;
    }

    this.redoStack.push(this.document);
    this.document = entry.document;
    this.emit();
    return true;
  }

  redo(): boolean {
    const document = this.redoStack.pop();
    if (document === undefined) {
      return false;
    }

    this.undoStack.push({ document: this.document });
    this.document = document;
    this.emit();
    return true;
  }

  /** Nodes bound to a control, for the impact preview before delete/type change. */
  nodesBoundTo(controlId: string): readonly { graphId: string; node: GraphNode }[] {
    return this.document.graphs.flatMap((graph) =>
      graph.nodes
        .filter((node) => node.controlId === controlId)
        .map((node) => ({ graphId: graph.id, node })),
    );
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  private reduce(document: GraphDocument, command: Command): GraphDocument {
    switch (command.kind) {
      case "transaction":
        return command.commands.reduce(
          (current, inner) => this.reduce(current, inner),
          document,
        );
      case "addControl":
        return this.addControl(document, command.control);
      case "updateControl":
        return this.updateControl(document, command.controlId, command.changes);
      case "replaceGraph": {
        const exists = document.graphs.some((graph) => graph.id === command.graph.id);
        if (!exists) {
          fail("graph.missing", `图 ${command.graph.id} 不存在。`);
        }
        return {
          ...document,
          graphs: document.graphs.map((graph) => (graph.id === command.graph.id ? command.graph : graph)),
        };
      }
      case "setDocumentField":
        if (PROTECTED_DOCUMENT_FIELDS.has(command.field)) {
          fail("document.protectedField", `字段 ${command.field} 不能直接修改。`);
        }
        return { ...document, [command.field]: command.value };
      case "removeControl":
        return {
          ...document,
          controls: (document.controls ?? []).filter(
            (control) => control.controlId !== command.controlId,
          ),
        };
      default:
        return this.updateGraph(document, command);
    }
  }

  private updateGraph(document: GraphDocument, command: GraphCommand): GraphDocument {
    const graph = document.graphs.find((candidate) => candidate.id === command.graphId);
    if (graph === undefined) {
      fail("graph.missing", `图 ${command.graphId} 不存在。`);
    }

    const updated = this.reduceGraph(graph, command);
    return {
      ...document,
      graphs: document.graphs.map((candidate) => (candidate === graph ? updated : candidate)),
    };
  }

  private reduceGraph(graph: Graph, command: GraphCommand): Graph {
    switch (command.kind) {
      case "addNode":
        if (graph.nodes.some((node) => node.id === command.node.id)) {
          fail("node.duplicateId", `节点 ID 重复：${command.node.id}`);
        }
        return { ...graph, nodes: [...graph.nodes, command.node] };

      case "removeNodes": {
        const removed = new Set(command.nodeIds);
        return {
          ...graph,
          nodes: graph.nodes.filter((node) => !removed.has(node.id)),
          edges: graph.edges.filter(
            (edge) => !removed.has(edge.from.nodeId) && !removed.has(edge.to.nodeId),
          ),
        };
      }

      case "moveNodes":
        return {
          ...graph,
          nodes: graph.nodes.map((node) => {
            const position = command.positions[node.id];
            return position === undefined ? node : { ...node, position };
          }),
        };

      case "connect": {
        if (graph.edges.some((edge) => sameEdge(edge, command.edge))) {
          fail("edge.duplicate", "连线已存在。");
        }
        const candidate = { ...graph, edges: [...graph.edges, command.edge] };
        this.assertEdge(candidate, command.edge);
        return candidate;
      }

      case "disconnect":
        return {
          ...graph,
          edges: graph.edges.filter((edge) => !sameEdge(edge, command.edge)),
        };

      case "updateScript":
        return this.updateScript(graph, command.nodeId, command.changes);

      case "setNodeField":
        if (command.field === "id" || command.field === "type") {
          fail("node.immutableField", `节点字段 ${command.field} 不可修改。`, command.nodeId);
        }
        return {
          ...graph,
          nodes: graph.nodes.map((node) =>
            node.id === command.nodeId ? { ...node, [command.field]: command.value } : node,
          ),
        };
    }
  }

  private assertEdge(graph: Graph, edge: Edge): void {
    const diagnostic = validateEdge(this.registry, graph, edge);
    if (diagnostic !== null) {
      throw new CommandError(diagnostic);
    }
  }

  /**
   * Port IDs are stable: renaming keeps edges, removed ports drop only their
   * edges, and edges that no longer type-check reject the whole change.
   */
  private updateScript(graph: Graph, nodeId: string, changes: ScriptChanges): Graph {
    const node = graph.nodes.find((candidate) => candidate.id === nodeId);
    if (node === undefined || !isScriptNode(node)) {
      fail("script.missing", "自定义脚本节点不存在。", nodeId);
    }

    const updated: ScriptNode = { ...node, ...changes, revision: node.revision + 1 };
    const portIds = new Set(this.registry.portsOf(updated).map((port) => port.id));
    const keepsEndpoint = (endpoint: Endpoint) =>
      endpoint.nodeId !== nodeId || portIds.has(endpoint.portId);

    const candidate: Graph = {
      ...graph,
      nodes: graph.nodes.map((existing) => (existing.id === nodeId ? updated : existing)),
      edges: graph.edges.filter((edge) => keepsEndpoint(edge.from) && keepsEndpoint(edge.to)),
    };

    for (const edge of candidate.edges) {
      if (edge.from.nodeId === nodeId || edge.to.nodeId === nodeId) {
        this.assertEdge(candidate, edge);
      }
    }
    return candidate;
  }

  private addControl(document: GraphDocument, control: ControlDefinition): GraphDocument {
    const controls = document.controls ?? [];
    if (controls.some((existing) => existing.controlId === control.controlId)) {
      fail("control.duplicateId", `控件 ID 重复：${control.controlId}`);
    }
    return { ...document, controls: [...controls, control] };
  }

  private updateControl(
    document: GraphDocument,
    controlId: string,
    changes: Partial<ControlDefinition>,
  ): GraphDocument {
    if (changes.controlId !== undefined && changes.controlId !== controlId) {
      fail("control.immutableId", "控件 ID 不可修改。");
    }

    const controls = document.controls ?? [];
    if (!controls.some((control) => control.controlId === controlId)) {
      fail("control.missing", `控件 ${controlId} 不存在。`);
    }

    return {
      ...document,
      controls: controls.map((control) =>
        control.controlId === controlId ? { ...control, ...changes } : control,
      ),
    };
  }
}
