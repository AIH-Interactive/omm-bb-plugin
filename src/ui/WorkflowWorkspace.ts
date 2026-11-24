import type { AnimationPlayback } from "../blockbench/host.ts";
import type { ControlType, Position } from "../workflow/schema.ts";
import { createControlPanel } from "./ControlPanel.ts";
import { createGraphCanvas } from "./GraphCanvas.ts";
import { createModelPreviewPanel } from "./ModelPreviewPanel.ts";
import { createNodeLibrary } from "./NodeLibrary.ts";
import { createScriptNodeEditor } from "./ScriptNodeEditor.ts";
import type { WorkspaceController } from "./workspace-controller.ts";

interface WorkspaceVm {
  controller: WorkspaceController;
  view: WorkspaceController["view"];
  $refs: { canvas?: { viewportCenter(): Position; fitView(): void } };
}

/** Vue 2 options component compiled by the host's runtime template compiler. */
export function createWorkflowWorkspace(controller: WorkspaceController, playback: AnimationPlayback): object {
  return {
    components: {
      "omm-graph-canvas": createGraphCanvas(controller),
      "omm-node-library": createNodeLibrary(controller),
      "omm-node-properties": createScriptNodeEditor(controller),
      "omm-control-panel": createControlPanel(controller),
      "omm-model-preview": createModelPreviewPanel(controller, playback),
    },
    data() {
      return { controller, view: controller.view };
    },
    computed: {
      errorCount(this: WorkspaceVm): number {
        return this.view.diagnostics.filter((diagnostic) => diagnostic.severity === "error").length;
      },
    },
    methods: {
      center(this: WorkspaceVm): Position {
        return this.$refs.canvas?.viewportCenter() ?? { x: 0, y: 0 };
      },
      insertNode(this: WorkspaceVm & { center(): Position }, type: string) {
        this.controller.addNode(type, this.center());
      },
      insertControl(this: WorkspaceVm & { center(): Position }, type: ControlType) {
        this.controller.addControl(type, this.center());
      },
      fitView(this: WorkspaceVm) {
        this.$refs.canvas?.fitView();
      },
      onKey(this: WorkspaceVm, event: KeyboardEvent) {
        // Workflow shortcuts only while focus is inside the workspace, never in text fields.
        const target = event.target as HTMLElement;
        if (target.matches("input, textarea, select") || !(event.ctrlKey || event.metaKey)) {
          return;
        }
        const key = event.key.toLowerCase();
        if (key === "z" && !event.shiftKey) {
          this.controller.undo();
        } else if (key === "y" || (key === "z" && event.shiftKey)) {
          this.controller.redo();
        } else if (key === "s") {
          this.controller.save();
        } else {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
      },
    },
    template: `
<div class="omm-workflow" @keydown="onKey">
  <div class="omm-workflow__toolbar">
    <button type="button" @click="controller.save()">保存</button>
    <button type="button" disabled title="P3 提供">导入 Lua</button>
    <button type="button" disabled title="P3 提供">导出 Lua</button>
    <span class="omm-separator"></span>
    <button type="button" :disabled="!view.canUndo" @click="controller.undo()">撤销</button>
    <button type="button" :disabled="!view.canRedo" @click="controller.redo()">重做</button>
    <button type="button" @click="fitView">适配视图</button>
    <span class="spacer"></span>
    <span :class="{ 'omm-diagnostic': errorCount > 0 }">诊断　{{ errorCount }} 条错误</span>
  </div>
  <div v-if="view.lastError" class="omm-workflow__error" @click="view.lastError = null">{{ view.lastError }}</div>
  <div class="omm-workflow__body">
    <div class="omm-workflow__side omm-workflow__side--left">
      <omm-node-library @insert-node="insertNode" @insert-control="insertControl"></omm-node-library>
    </div>
    <omm-graph-canvas ref="canvas"></omm-graph-canvas>
    <div class="omm-workflow__side omm-workflow__side--right">
      <div class="omm-tabs">
        <button type="button" :class="{ active: view.rightTab === 'properties' }" @click="view.rightTab = 'properties'">节点属性</button>
        <button type="button" :class="{ active: view.rightTab === 'controls' }" @click="view.rightTab = 'controls'">控件</button>
        <button type="button" :class="{ active: view.rightTab === 'preview' }" @click="view.rightTab = 'preview'">模型预览</button>
      </div>
      <omm-node-properties v-show="view.rightTab === 'properties'"></omm-node-properties>
      <omm-control-panel v-show="view.rightTab === 'controls'"></omm-control-panel>
      <omm-model-preview v-show="view.rightTab === 'preview'"></omm-model-preview>
    </div>
  </div>
  <div class="omm-workflow__footer">
    <span>Generic Model · {{ controller.store.document.targetProfile }}</span>
    <span class="omm-muted">{{ view.graph.nodes.length }} 个节点 · {{ view.graph.edges.length }} 条连线</span>
  </div>
</div>`,
  };
}
