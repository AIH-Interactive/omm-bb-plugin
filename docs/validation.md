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

## P2 图编辑、控件模拟与动画预览

| 项目 | 结果 | 证据 |
|---|---|---|
| 类型检查、业务测试（29 项）、单文件构建 | PASS | `npm run typecheck`、`npm test`、`npm run build` |
| 非法边（类型/种类/方向/多输入/执行出口多连）被拒且图不变 | PASS | `tests/workflow.test.ts` |
| 脚本端口改名保留连线；删端口只删其连线；不兼容类型变更整体回滚 | PASS | 同上 |
| 脚本正文逐字保存；取值模式无执行口 | PASS | 同上 |
| 添加控件 + 默认节点一次撤销；失败事务不生效；一次拖动合并为一步 | PASS | 同上 |
| 无效控件输入不派发、保留旧值；滑块步长；按钮按下/跳页；重置 | PASS | 同上（规则对照 OMM `AvatarControlDefinition.normalizeValue`、`AvatarControlsScreen`） |
| 骨骼按 UUID 解析，改名跟随，删除/换工程报诊断，不被同名新骨骼顶替 | PASS | 同上 |
| 拖尾：有界、同帧去重、倒拖/切动画重建、删除骨骼后停止采样并清除叠加层 | PASS | 同上 |
| 未知节点和字段不全的脚本节点原样保留并报诊断 | PASS | 同上 |
| 原版 Blockbench 实窗：画布连线与拖动、控件面板、原生时间轴播放与拖尾叠加、CJK、125% DPI | MANUAL/PENDING | 本机未安装 Blockbench |
| 画布性能基准（500 节点 / 750 边，p95 帧间隔 ≤ 33 ms） | MANUAL/PENDING | 需真实窗口；画布已实现视口裁剪 |
| 生命周期测试 | SKIPPED（用户禁止） | — |

实现说明：
- 组件均为 Vue 2 选项对象 + 运行时模板（`src/ui/*.ts`），未引入 SFC 编译链。
- 动画预览采用 P0 记录的降级路线：插件面板控制原生 Timeline/Animation，拖尾以插件自有 THREE.Line 叠加到 `Canvas.scene`，「在原生动画视口中查看」切到原生动画模式；未在插件面板内挂载独立 Preview 实例。
