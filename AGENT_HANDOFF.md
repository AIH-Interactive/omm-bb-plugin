# Agent 交接记录

## 当前任务与阶段

- 用户要求完成计划书剩余目标 P1–P7，按阶段提交推送。
- P0、P1 已完成；下一阶段 P2（GraphCanvas、NodeLibrary、ScriptNodeEditor、store、validate、registry、控件模拟、骨骼树与动画预览）。

## 已完成（已验证）

- P1：TS/esbuild/node:test 工具链（`package.json` 锁定 typescript 7.0.2、esbuild 0.28.2、@types/node 22）；`npm run typecheck`、`npm test`（11 项）、`npm run build` 均通过。
- 插件入口 `src/plugin/main.ts`，Mode `omm_lua_workflow`，OMM 菜单「Lua 工作流」，空状态工作区，sidecar `<model>.omm-workflow.json` 原子保存，错误可观察。详见 `docs/validation.md`。

## 未验证

- 原版 Blockbench 真实窗口加载 `dist/omm_bb_plugin.js`：MANUAL/PENDING。
- 生命周期测试：SKIPPED（用户禁止）。

## 下一步

1. 读计划书 §8、§9、§16–17 与 P2 行，用 Penpot MCP 核对相关画板。
2. 先写 store/validate/registry 的业务测试，再实现。

## 约束

- 仅 Windows 原生工具链，不用 WSL；Qt 禁止 offscreen。
- 构建/测试前台 PowerShell + `Tee-Object build.log` + 检查 `$LASTEXITCODE`。
- Node 以 strip-types 直接运行 .ts 测试：禁止参数属性、enum 等非可擦除语法（tsconfig 已开 `erasableSyntaxOnly`）。
