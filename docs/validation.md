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

## P3 Lua 双向转换

运行语义检查使用发行 JAR 内嵌的 LuaJ（`luaj-core/jse 3.0.8-figura`），由 Java 25 通过 `scripts/luaj.mjs` + `tools/luaj/LuaRun.java` 执行，`events.TICK/RENDER` 为最小桩。

| 项目 | 结果 | 证据 |
|---|---|---|
| 类型检查、业务测试（40 项）、单文件构建（含 luaparse 0.3.1，MIT） | PASS | `npm run typecheck`、`npm test`、`npm run build` |
| 自定义脚本：两输入两输出、nil、多返回、正文注释/长字符串原样插入，在 LuaJ 实际执行结果正确 | PASS | `tests/lua.test.ts` |
| 取值节点被多个消费者引用时每次执行只求值一次 | PASS | 同上（LuaJ 输出核对） |
| 数值 for 倒序 + break：文档示例输出 12 | PASS | 同上 |
| 跨分支使用取值结果、循环外 break、循环变量出体引用、未审核 API 节点：阻止导出并给诊断 | PASS | 同上 |
| 手写 Lua（注释、同行多语句、具名注册、RENDER 参数、goto、bit32、长字符串、无结尾换行）结构导入后再导出逐字节一致，LuaJ 输出与原文件一致 | PASS | 同上 |
| 语法错误：整个文件保留为原始 Lua，导出逐字节一致 | PASS | 同上 |
| 回导清单：恢复原 ID/布局；外部正文修改进入待确认列表，不自动覆盖 | PASS | 同上 |
| 清单缺失/损坏/版本不符/标记重复/结构被改写：按实际文本导入，旧正文不覆盖导入源码 | PASS | 同上 |
| 导出计划：外部修改识别为冲突；多文件发布全部成功或全部不写，失败保留旧产物 | PASS | `tests/export.test.ts` |
| 导入/导出/冲突对话框、Lua 预览在原版 Blockbench 实窗中操作 | MANUAL/PENDING | 本机未安装 Blockbench |
| OMM 游戏内运行导出脚本 | MANUAL/PENDING | 需游戏环境 |

实现说明与偏差：
- 自定义脚本函数定义在首次使用它的顶层语句或事件注册之前，以便看见此前声明的局部变量（直接放文件顶部时 LuaJ 实测失败）。
- for 循环用「循环体」执行口 + 「完成」口表达，未实现独立子图与面包屑导航；`core.if` 增加「完成」口。
- 结构导入只把顶层 `events.TICK/RENDER:register(function(...) ... end)` 转为事件节点，其余语句（含 if/for）按原文保留为「原始 Lua」节点，保证不丢码；把 if/for 文本还原为结构化节点未实现。
- 回导清单保存在工作流文档 `luaExport.manifest`（编辑源侧），不写入运行包。
