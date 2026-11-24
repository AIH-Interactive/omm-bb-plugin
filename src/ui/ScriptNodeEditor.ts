import { isScriptNode, type GraphNode, type Port, type ScriptNode } from "../workflow/schema.ts";
import { isLuaIdentifier } from "../workflow/validate.ts";
import { createId, type WorkspaceController } from "./workspace-controller.ts";

interface Draft {
  nodeId: string;
  revision: number;
  mode: ScriptNode["mode"];
  inputs: Port[];
  outputs: Port[];
  source: string;
}

interface EditorVm {
  controller: WorkspaceController;
  view: WorkspaceController["view"];
  draft: Draft | null;
  node: GraphNode | null;
  syncDraft(): void;
}

const PORT_TYPES = ["any", "number", "string", "boolean", "table", "function", "ModelPart", "Vector3"];

function draftFrom(node: ScriptNode): Draft {
  return {
    nodeId: node.id,
    revision: node.revision,
    mode: node.mode,
    inputs: node.inputs.map((port) => ({ ...port })),
    outputs: node.outputs.map((port) => ({ ...port })),
    source: node.source,
  };
}

/**
 * Property panel. Script signature, mode and body are edited as a draft and
 * applied as one undoable command; removed ports show their affected edges.
 */
export function createScriptNodeEditor(controller: WorkspaceController): object {
  return {
    name: "omm-node-properties",
    data() {
      return { controller, view: controller.view, draft: null, portTypes: PORT_TYPES };
    },
    computed: {
      node(this: EditorVm): GraphNode | null {
        return this.view.graph.nodes.find((node) => node.id === this.view.selectedNodeId) ?? null;
      },
      title(this: EditorVm): string {
        const node = this.node;
        return node === null ? "" : (this.controller.registry.get(node.type)?.title ?? node.type);
      },
      isScript(this: EditorVm): boolean {
        return this.node !== null && isScriptNode(this.node);
      },
      dirty(this: EditorVm): boolean {
        const node = this.node;
        if (this.draft === null || node === null || !isScriptNode(node)) {
          return false;
        }
        const current = draftFrom(node);
        return JSON.stringify({ ...current, revision: 0 }) !== JSON.stringify({ ...this.draft, revision: 0 });
      },
      /** Edges that applying the draft would remove. */
      affectedEdges(this: EditorVm): number {
        const draft = this.draft;
        if (draft === null) {
          return 0;
        }
        const kept = new Set([...draft.inputs, ...draft.outputs].map((port) => port.id));
        if (draft.mode === "statement") {
          kept.add("exec_in");
          kept.add("exec_out");
        }
        return this.view.graph.edges.filter((edge) =>
          (edge.from.nodeId === draft.nodeId && !kept.has(edge.from.portId)) ||
          (edge.to.nodeId === draft.nodeId && !kept.has(edge.to.portId)),
        ).length;
      },
      nodeDiagnostics(this: EditorVm) {
        return this.view.diagnostics.filter((diagnostic) => diagnostic.nodeId === this.view.selectedNodeId);
      },
      sourceLines(this: EditorVm): number {
        return Math.max(6, (this.draft?.source.split("\n").length ?? 0) + 1);
      },
    },
    watch: {
      node: {
        immediate: true,
        handler(this: EditorVm) {
          this.syncDraft();
        },
      },
    },
    methods: {
      syncDraft(this: EditorVm) {
        const node = this.node;
        const sameNode = this.draft !== null && node !== null && this.draft.nodeId === node.id;
        if (node === null || !isScriptNode(node)) {
          this.draft = null;
        } else if (!sameNode || this.draft!.revision !== node.revision) {
          // Undo/redo or another edit changed the node: discard the stale draft.
          this.draft = draftFrom(node);
        }
      },
      addPort(this: EditorVm, direction: "input" | "output") {
        const list = direction === "input" ? this.draft!.inputs : this.draft!.outputs;
        list.push({
          id: createId(direction === "input" ? "in" : "out"),
          name: `${direction === "input" ? "input" : "output"}${list.length + 1}`,
          type: "any",
          direction,
          kind: "data",
        });
      },
      removePort(this: EditorVm, direction: "input" | "output", index: number) {
        (direction === "input" ? this.draft!.inputs : this.draft!.outputs).splice(index, 1);
      },
      nameValid(name: string): boolean {
        return isLuaIdentifier(name);
      },
      apply(this: EditorVm) {
        const draft = this.draft!;
        const ok = this.controller.apply({
          kind: "updateScript",
          graphId: this.view.graph.id,
          nodeId: draft.nodeId,
          changes: { mode: draft.mode, inputs: draft.inputs, outputs: draft.outputs, source: draft.source },
        });
        if (ok) {
          this.draft = null;
          this.syncDraft();
        }
      },
      discard(this: EditorVm) {
        this.draft = null;
        this.syncDraft();
      },
      setField(this: EditorVm, field: string, value: unknown) {
        this.controller.apply({ kind: "setNodeField", graphId: this.view.graph.id, nodeId: this.node!.id, field, value });
      },
      onSourceKey(event: KeyboardEvent) {
        // Keep Tab inside the Lua body instead of moving focus.
        if (event.key !== "Tab") {
          return;
        }
        event.preventDefault();
        const area = event.target as HTMLTextAreaElement;
        area.setRangeText("\t", area.selectionStart, area.selectionEnd, "end");
        area.dispatchEvent(new Event("input"));
      },
    },
    template: `
<div class="omm-properties">
  <div v-if="!node" class="omm-muted">选择节点查看属性</div>
  <template v-else>
    <h3 class="omm-section-title">{{ title }}</h3>
    <div v-for="diagnostic in nodeDiagnostics" :key="diagnostic.code + diagnostic.message" class="omm-diagnostic">{{ diagnostic.message }}</div>
    <template v-if="isScript && draft">
      <label class="omm-field">执行模式
        <select class="omm-input" v-model="draft.mode">
          <option value="value">取值</option>
          <option value="statement">流程触发</option>
        </select>
      </label>
      <div v-for="direction in ['input', 'output']" :key="direction">
        <div class="omm-subtitle">{{ direction === 'input' ? '输入' : '输出' }}</div>
        <div v-for="(port, index) in (direction === 'input' ? draft.inputs : draft.outputs)" :key="port.id" class="omm-port-row">
          <input class="omm-input" v-model="port.name" :class="{ invalid: !nameValid(port.name) }" :title="nameValid(port.name) ? '' : '不是合法的 Lua 标识符'">
          <select class="omm-input" v-model="port.type">
            <option v-for="type in portTypes" :key="type" :value="type">{{ type }}</option>
          </select>
          <button type="button" class="omm-icon-button" title="删除端口" @click="removePort(direction, index)">×</button>
        </div>
        <button type="button" class="omm-link-button" @click="addPort(direction)">＋ 添加{{ direction === 'input' ? '输入' : '输出' }}</button>
      </div>
      <div class="omm-subtitle">Lua 正文</div>
      <textarea class="omm-code" v-model="draft.source" :rows="sourceLines" spellcheck="false" @keydown="onSourceKey"></textarea>
      <div v-if="affectedEdges > 0" class="omm-diagnostic">应用后将删除 {{ affectedEdges }} 条连线。</div>
      <div class="omm-actions">
        <button type="button" :disabled="!dirty" @click="apply">应用</button>
        <button type="button" :disabled="!dirty" @click="discard">还原</button>
      </div>
    </template>
    <template v-else-if="node.type === 'core.rawLua'">
      <div class="omm-subtitle">Lua 原文</div>
      <textarea class="omm-code" :value="node.source" rows="8" spellcheck="false" @change="setField('source', $event.target.value)"></textarea>
      <div class="omm-muted omm-hint">原文按字节保留，导出时原样写回。</div>
    </template>
    <template v-else-if="node.type === 'core.constant.number'">
      <label class="omm-field">值
        <input class="omm-input" type="number" :value="node.value" @change="setField('value', Number($event.target.value))">
      </label>
    </template>
    <div class="omm-muted omm-node-id">节点 ID　{{ node.id }}</div>
  </template>
</div>`,
  };
}
