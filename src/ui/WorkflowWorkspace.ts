import type { SaveResult, WorkflowSession } from "../workflow/session.ts";

export interface WorkflowWorkspaceProps {
  session: WorkflowSession;
  save(): SaveResult;
}

const STYLE = `
.omm-workflow { display: flex; flex-direction: column; height: 100%; color: var(--color-text); background: var(--color-back); }
.omm-workflow__toolbar { display: flex; align-items: center; gap: 8px; padding: 4px 8px; background: var(--color-ui); border-bottom: 1px solid var(--color-border); }
.omm-workflow__toolbar .spacer { flex: 1; }
.omm-workflow__body { display: flex; flex: 1; min-height: 0; }
.omm-workflow__side { width: 240px; padding: 8px; background: var(--color-ui); overflow-y: auto; }
.omm-workflow__side input { width: 100%; }
.omm-workflow__side h3 { margin: 4px 0 8px; font-size: 1em; }
.omm-workflow__canvas { flex: 1; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 8px; }
.omm-workflow__empty-title { font-size: 1.2em; }
.omm-workflow__muted { color: var(--color-subtle_text); }
.omm-workflow__error { color: var(--color-close); padding: 4px 8px; }
.omm-workflow__footer { display: flex; justify-content: space-between; padding: 2px 8px; background: var(--color-ui); border-top: 1px solid var(--color-border); }
`;

const TEMPLATE = `
<div class="omm-workflow">
  <div class="omm-workflow__toolbar">
    <button type="button" @click="save">保存</button>
    <button type="button" disabled title="后续阶段提供">导入 Lua</button>
    <button type="button" disabled title="后续阶段提供">导出 Lua</button>
    <span class="spacer"></span>
    <span>诊断　{{ errorCount }} 条错误</span>
  </div>
  <div v-if="state.loadError" class="omm-workflow__error">{{ state.loadError }}</div>
  <div class="omm-workflow__body">
    <div class="omm-workflow__side">
      <h3>节点库</h3>
      <input type="text" placeholder="搜索节点 / Lua 名称" disabled>
    </div>
    <div class="omm-workflow__canvas">
      <template v-if="nodeCount === 0">
        <div class="omm-workflow__empty-title">此工作流还没有节点</div>
        <div class="omm-workflow__muted">从节点库拖入节点，或打开搜索。</div>
      </template>
      <div v-else>{{ nodeCount }} 个节点</div>
    </div>
    <div class="omm-workflow__side">
      <h3>属性</h3>
      <div class="omm-workflow__muted">选择节点查看属性</div>
    </div>
  </div>
  <div class="omm-workflow__footer">
    <span>{{ state.document.targetProfile }}</span>
    <span class="omm-workflow__muted">{{ state.modelPath || "模型尚未保存" }}</span>
  </div>
</div>
`;

/** Vue 2 options component for the host's runtime template compiler. */
export function createWorkflowWorkspace(props: WorkflowWorkspaceProps): object {
  return {
    data() {
      return { state: props.session.state };
    },
    computed: {
      nodeCount(this: { state: WorkflowSession["state"] }): number {
        return this.state.document.graphs.reduce((sum, graph) => sum + graph.nodes.length, 0);
      },
      errorCount(this: { state: WorkflowSession["state"] }): number {
        return this.state.loadError === null ? 0 : 1;
      },
    },
    methods: {
      save(): void {
        props.save();
      },
    },
    template: TEMPLATE,
  };
}

export const WORKFLOW_WORKSPACE_STYLE = STYLE;
