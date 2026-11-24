import type { LuaIoController } from "./lua-io.ts";

/**
 * Overlay for blocked exports, external-edit conflicts (generated vs.
 * external text, with re-import / save copy / confirmed overwrite / cancel)
 * and import review (method, diagnostics, per-body acceptance).
 */
export function createImportExportDialog(io: LuaIoController): object {
  return {
    name: "omm-import-export-dialog",
    data() {
      return { io, state: io.state };
    },
    template: `
<div v-if="state.dialog.kind !== 'none'" class="omm-dialog-backdrop">
  <div class="omm-dialog" role="dialog" aria-modal="true">
    <template v-if="state.dialog.kind === 'diagnostics'">
      <h3 class="omm-section-title">{{ state.dialog.title }}</h3>
      <div v-for="(diagnostic, index) in state.dialog.diagnostics" :key="index" :class="diagnostic.severity === 'error' ? 'omm-diagnostic' : 'omm-muted'">
        {{ diagnostic.message }}<span v-if="diagnostic.nodeId" class="omm-muted">（节点 {{ diagnostic.nodeId }}）</span>
      </div>
      <div class="omm-actions"><button type="button" @click="io.close()">关闭</button></div>
    </template>

    <template v-else-if="state.dialog.kind === 'conflict'">
      <h3 class="omm-section-title">Lua 文件在编辑器外被修改</h3>
      <div class="omm-muted">{{ state.dialog.conflict.file.path }}</div>
      <div class="omm-compare">
        <div><div class="omm-subtitle">图生成结果</div><pre class="omm-code">{{ state.dialog.conflict.file.content }}</pre></div>
        <div><div class="omm-subtitle">外部代码（当前磁盘）</div><pre class="omm-code">{{ state.dialog.conflict.external }}</pre></div>
      </div>
      <div class="omm-muted">缓存基线哈希：{{ state.dialog.conflict.baselineDigest || '无（首次导出到此位置）' }}</div>
      <div class="omm-actions">
        <button type="button" @click="io.reimportConflict()">重新导入外部代码</button>
        <button type="button" @click="io.saveAsCopy()">另存为副本</button>
        <button type="button" @click="io.overwriteConflicts()">覆盖…</button>
        <button type="button" @click="io.close()">取消</button>
      </div>
    </template>

    <template v-else-if="state.dialog.kind === 'import'">
      <h3 class="omm-section-title">导入 Lua</h3>
      <div class="omm-muted">{{ state.dialog.path }}</div>
      <div>{{ state.dialog.method === 'manifest' ? '已通过回导清单恢复节点 ID 和布局。' : '按 Lua 文本导入：事件转为节点，其余语句保留为原始 Lua。' }}</div>
      <div v-for="(diagnostic, index) in state.dialog.diagnostics" :key="index" :class="diagnostic.severity === 'error' ? 'omm-diagnostic' : 'omm-muted'">{{ diagnostic.message }}</div>
      <div v-for="pending in state.dialog.pendingBodies" :key="pending.nodeId" class="omm-pending">
        <label><input type="checkbox" v-model="state.dialog.accepted[pending.nodeId]"> 采纳节点 {{ pending.nodeId }} 的外部正文修改</label>
        <div class="omm-compare">
          <pre class="omm-code">{{ pending.previous }}</pre>
          <pre class="omm-code">{{ pending.next }}</pre>
        </div>
      </div>
      <div class="omm-diagnostic">导入会替换当前主工作流（可撤销）。</div>
      <div class="omm-actions">
        <button type="button" @click="io.confirmImport()">导入</button>
        <button type="button" @click="io.close()">取消</button>
      </div>
    </template>
  </div>
</div>`,
  };
}
