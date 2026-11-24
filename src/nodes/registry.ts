import type { GraphNode, Port } from "../workflow/schema.ts";

export interface NodeDefinition {
  /** Stable type ID persisted in documents. */
  readonly type: string;
  readonly title: string;
  readonly category: string;
  /** Lua-facing name used by search, e.g. `events.TICK`. */
  readonly luaName?: string;
  /** Ports of a concrete node; static definitions ignore `node`. */
  ports(node: GraphNode): readonly Port[];
  /** Initial persisted fields (besides id/type/position) for a new node. */
  create?(): Record<string, unknown>;
}

export class NodeRegistry {
  private readonly definitions = new Map<string, NodeDefinition>();

  /** Rejects duplicate type IDs and duplicate port IDs of the initial node. */
  register(definition: NodeDefinition): void {
    if (this.definitions.has(definition.type)) {
      throw new Error(`节点类型重复：${definition.type}`);
    }

    const sample: GraphNode = { id: "__sample__", type: definition.type, ...definition.create?.() };
    const portIds = definition.ports(sample).map((port) => port.id);
    const duplicate = portIds.find((id, index) => portIds.indexOf(id) !== index);
    if (duplicate !== undefined) {
      throw new Error(`节点 ${definition.type} 的端口 ID 重复：${duplicate}`);
    }

    this.definitions.set(definition.type, definition);
  }

  get(type: string): NodeDefinition | undefined {
    return this.definitions.get(type);
  }

  all(): readonly NodeDefinition[] {
    return [...this.definitions.values()];
  }

  /** Ports of a node; unknown types have none (they are kept as placeholders). */
  portsOf(node: GraphNode): readonly Port[] {
    return this.definitions.get(node.type)?.ports(node) ?? [];
  }

  search(query: string): readonly NodeDefinition[] {
    const needle = query.trim().toLowerCase();
    if (needle === "") {
      return this.all();
    }

    return this.all().filter((definition) =>
      [definition.title, definition.luaName ?? "", definition.category, definition.type]
        .some((text) => text.toLowerCase().includes(needle)),
    );
  }
}
