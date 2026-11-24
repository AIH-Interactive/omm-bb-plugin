# 验收记录

## P1 插件骨架

| 项目 | 结果 | 证据 |
|---|---|---|
| 类型检查 `npm run typecheck` | PASS | build.log（本地，未跟踪） |
| 业务测试 `npm test`（11 项） | PASS | `tests/workflow-file.test.ts`、`tests/plugin.test.ts` |
| 单文件构建 `npm run build` | PASS | `dist/omm_bb_plugin.js`，IIFE，未打包 Vue |
| 非法 schema / 写失败 / 未保存模型均给出可观察错误，原文件不被覆盖 | PASS | `tests/plugin.test.ts` |
| 原版 Blockbench 中 OMM 菜单 → Lua 工作流、模式切换、CJK 显示、真实 sidecar 写入 | MANUAL/PENDING | 需在真实 Windows 窗口加载 `dist/omm_bb_plugin.js` |
| 生命周期测试 | SKIPPED（用户禁止） | — |

实现说明：
- 工作区组件以 Vue 2 选项对象 + 运行时模板实现（`src/ui/WorkflowWorkspace.ts`），不引入 SFC 编译链；宿主 Vue 2.7 编译模板。
- 模式图标使用宿主内置 Material 图标 `account_tree`，未新增 `assets/icons/workflow.svg`。
- 工作流保存为模型旁的 `<model>.omm-workflow.json`；先写 `.tmp` 再替换。读取失败时禁止保存以免覆盖原文件。
- 首次读写时才请求宿主 `fs` 权限。
