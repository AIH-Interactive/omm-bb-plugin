# Agent 交接记录

## 当前任务与阶段

- 用户要求完成计划书剩余目标 P1–P7，按阶段提交推送。
- P0、P1、P2 已完成；下一阶段 P3（parser、IR、emitter、roundtrip、导出预览和文件计划）。
- 用户追加要求：OMM 菜单其余入口（新建 OMM 模型、Figura/YSM 模板、模型检查、API 参考等）全部实现，模板取自 `refs/omni-morph` 源码和 JAR；按计划在 P6（API 参考依赖 P4）实现。

## 已完成（已验证）

- P1：TS/esbuild/node:test 工具链（`package.json` 锁定 typescript 7.0.2、esbuild 0.28.2、@types/node 22）；`npm run typecheck`、`npm test`（11 项）、`npm run build` 均通过。
- 插件入口 `src/plugin/main.ts`，Mode `omm_lua_workflow`，OMM 菜单「Lua 工作流」，空状态工作区，sidecar `<model>.omm-workflow.json` 原子保存，错误可观察。详见 `docs/validation.md`。

- P2：GraphStore（快照撤销、拖动合并、原子事务）、validate、NodeRegistry、自定义脚本节点、控件模拟、骨骼树、拖尾、画布/节点库/属性/控件/预览 UI；29 项测试通过。详见 `docs/validation.md`。
- 远端：`origin` = https://github.com/AIH-Interactive/omm-bb-plugin.git（P1 起已配置）。

## 未验证

- 原版 Blockbench 真实窗口（P1/P2 全部界面、性能基准、CJK/DPI）：MANUAL/PENDING，本机未安装 Blockbench。
- 生命周期测试：SKIPPED（用户禁止）。

## 下一步

1. 读计划书 §9、§10、§17 与 P3 行；评估 luaparse 5.2 模式（P0 定为首选），用 LuaJ（Java 25）对照语法。
2. 先写 golden/往返测试，再实现 parser→IR→emitter→roundtrip。

## 约束

- 仅 Windows 原生工具链，不用 WSL；Qt 禁止 offscreen。
- 构建/测试前台 PowerShell + `Tee-Object build.log` + 检查 `$LASTEXITCODE`。
- Node 以 strip-types 直接运行 .ts 测试：禁止参数属性、enum 等非可擦除语法（tsconfig 已开 `erasableSyntaxOnly`）。
