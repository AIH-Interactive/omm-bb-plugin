# P0 源码与工件基线

记录于 2026-11-24。执行目标、范围和阶段顺序见 [开发计划书](../OMM_BB_Plugin_开发计划书.md)。API 白名单候选及 For 约束见 [节点化清单](../OMM_BB_Plugin_节点化清单与For实现.md)。三份参考源使用 CodeGraph 或已记录的源码锚点核实。本阶段只读取参考树。

## 版本和许可

| 对象 | 锁定依据 |
|---|---|
| Blockbench | 参考提交 `ec0b2827104d0799c153bfb5f867579c0c44652f`，package.json 5.2.2，Vue 2.7 依赖；宿主源码 GPL-3.0-or-later，仅查阅和调用宿主公开能力 |
| OMM 源码 | 参考提交 `261e0b409cd43d3c3b77aaff93cc4460f713b6e5`；源码与发行工件分别锁定 |
| OMM 发行工件 | refs 下 Fabric JAR，SHA-256 `9f534c57c901f6f32fb4ab5d726f36f7c0b93095e6fde8f93ed1713c3e0971c6`；清单版本 `1.0.0-alpha.12+26.1.2-d4c41b0c`，client，Java ≥25、Minecraft ≥26.1.2、Fabric Loader ≥0.15 |
| 嵌套 LuaJ | core/jse 均为 `3.0.8-figura`；core SHA-256 `c3c35095b818865659b817d9945ee25710d7e575b2065f76ccd65502e862bdaa`，jse SHA-256 `2984cb57496fc812b035d24162c4aaf38c1a283c7095a28f68aa79b8d7896a09` |
| YSM 参考插件 | 参考提交 `bf09af5c95fb87617828bdcc87379bbd77a59e2a`，MIT；样本资产继续按各自授权处理 |
| Windows 工具 | Node 22.22.2；默认 java 为 17.0.18，OMM 业务验证显式使用可用的 Java 25.0.2。P1 采用 TypeScript、esbuild 单脚本 IIFE、Node 内置测试和宿主 Vue；P3 评估 luaparse 5.2 模式对目标工件的语法覆盖。各阶段安装时固化实际依赖版本及许可证 |

打包、语法与测试工具依据。[esbuild IIFE](https://esbuild.github.io/api/#format) · [Node 测试工具](https://nodejs.org/api/test.html) · [luaparse](https://github.com/fstirlitz/luaparse)

## 扩展路径和验证结论

| 能力 | 静态证据与实施决策 | 剩余实机证据 |
|---|---|---|
| Mode 与菜单 | BB `js/modes.ts:44–79,158–164,198–226` 构造 Mode、组件和选项；`index.html:162–171` 读取模式界面；`js/interface/menu_bar.ts:19–78,862` 提供 BarMenu 与菜单 Action。P1 首选 Mode + BarMenu，选项更新适配隔离在插件中 | 原版窗口确认后注册响应性、动画后位置、菜单可访问性。MANUAL/PENDING |
| 骨骼与原生预览 | BB `js/outliner/outliner.js:10–12` 获取根，Group UUID 对应 `Project.nodes_3d`，`js/preview/preview.ts:734–757` 使用 Canvas.scene，`js/animations/animation_mode.js:365–468` 在原生求值后触发 `display_animation_frame`。适配层使用只读骨骼快照、原生预览和可释放订阅 | 相机、时间轴、拖尾、模式切换与动画面板协作由真实窗口检验。MANUAL/PENDING |
| 控件与动画桥接 | OMM 源码 `AvatarControlsAPI.java`、`AvatarControlDefinition.java` 与 `AvatarControlsScreen.java:372–478` 区分值、动作和导航。发行 JAR `javap` 确认 `newControl/newPage/resetAll` 及 `AnimationAPI.evalMolang/getMolangVar/setMolangVar/setMolangVars/getMolangVars` 方法存在 | 游戏内可达性、回调分发与上下文语义。MANUAL/PENDING |
| 模块路径 | OMM `ScriptPath.java:14–51` 与 `FiguraLuaRuntime.java:245–260,366–390,424–435` 表明点/斜杠路径、相对路径、脚本表、缓存、循环检测与 autoScripts。导出候选使用 `libs/arm_swing.lua` 文件及 `require("libs.arm_swing")` 标识；实际打包脚本键由业务验收确认 | 入口与子模块在真实 Avatar 上按预期执行。MANUAL/PENDING |
| 持久化 | BB `js/formats/bbmodel.js:101,398,445,600` 发出 project codec 事件。首版工作流使用独立 sidecar，避免把插件扩展字段的保留当作宿主保证 | 使用实际工程执行保存、外部变更及重新导入。MANUAL/PENDING |

## 可执行语法检查

将已锁定发行工件内的 LuaJ core 和 jse 解入独立临时目录，以相同的 Base、Bit32、Table、String、Math 与 LuaC 初始化顺序构造库级 `Globals`。用现有 Java 25 按 PowerShell 前台规范执行，捕获退出码为 0。日志文件是本地 `build.log`。

| 经验结果 | 断言 |
|---|---|
| PASS | 数值 For 倒序，`break` 退出，累加结果为 12 |
| PASS | 通用 For 尾位三返回，false 为有效 control 值，后续 nil 终止 |
| PASS | 变参与多返回保留中间 nil 槽 |
| PASS | 目标 LuaJ 编译并执行 goto/label 和 bit32 |
| PASS | 语法错误的数值 For 抛出 LuaError |
| PASS | Java 25 直接调用发行 JAR 的 ScriptPath，点式与斜杠式名称均得 `libs/arm_swing`；`libs/nested/entry` 的同级及上一级相对解析分别得 `libs/nested/helper` 和 `libs/helper`；根名称保持根解析 |

证据范围为实际发行工件内的 LuaJ 库语法与求值。OMM 自定义 require、权限、全局、事件及完整沙箱初始化需要真实运行时证据。没有运行独立生命周期测试，状态为 SKIPPED（用户禁止）。

## 本地业务样本

| 入口 | 已查证的文件结构 | 后续验收 |
|---|---|---|
| 01_taisho_maid、02_new_year、03_astronaut、YSM_NEW_Model | 四份 `ysm.json` 都是 spec 2，主/手臂模型路径存在于清单。01 和 03 指向控制器，02 未声明，YSM_NEW_Model 列空数组 | 读取清单、校验引用、处理不同控制器声明 |
| YSM_OLD_Model | main.json、arm.json、多个 animation.json 及纹理，未发现 spec 2 清单 | 区分旧目录并进行隔离迁移 |
| wangshu.zip | 同一目录含 avatar.json、wangshu.bbmodel、script.lua | 精简 Figura 端到端候选；先核对样本授权 |
| AI Hobbyist Founder Public Server.zip | 同目录含 avatar.json、model.bbmodel、script.lua、lib/actionwheel.lua、lib/particle.lua、lib/rot.lua | 多模块、控件和粒子业务候选，按实际脚本及许可挑用 |
| anan-fullmodel-0.0.7-rel.zip、cs_skin_s9Cthulhu_new.zip | 可见多个模型或成组脚本，样本清单不随插件发布 | 复杂脚本透传及诊断；先核对许可和 OMM 可加载性 |

P0 静态可行性、Penpot 来源、Java/LuaJ 语言实验、依赖路线和样本清单已记录。真实宿主和 OMM 验收按计划保持 MANUAL/PENDING。
