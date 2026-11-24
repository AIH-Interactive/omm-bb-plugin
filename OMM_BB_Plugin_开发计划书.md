# OMM_BB_Plugin 开发计划书

日期 2026-11-24。首版目标环境为 Windows Desktop Blockbench 5.2.2 与本地 Fabric OmniMorph 1.0.0-alpha.12+26.1.2。本文交付源码研究、原型规格和 P0–P7 实施计划。正式插件开发从 P0 开始执行。

## 1. 目标与交付范围

提供「Lua工作流」工作模式、节点库、可编辑图、Lua 双向转换、可复用子图/脚本库、OMM 菜单与模板、YSM 编辑辅助。保留原生 Generic Model 的建模、动画及工程机制。自定义 Lua 脚本节点是首版验收必需项。Web、移动端、其他游戏版本和任意 Lua 的完整可视化属于首版范围外。测试模型使用 `refs/models`，只读引用和隔离输出。

## 2. 源码证据与基线

本地三份参考树均有 CodeGraph 索引，先检索符号和路径，再以源码、构建配置、资源及 ZIP 清单补充。下文以 BB、OMM、YSM 代表 `refs/blockbench`、`refs/omni-morph`、`refs/YSM-Utils-Plugins`。OMM Java 路径默认相对于 `common/src/main/java`。源码树与发布 JAR 单独记录版本，P0 核对差异。JAR SHA-256 为 `9f534c57c901f6f32fb4ab5d726f36f7c0b93095e6fde8f93ed1713c3e0971c6`。证据状态采用 **已通过源码确认**、**设计推断，待验证**、**需要原型实验**、**暂不支持**。

## 3. Blockbench 扩展可行性

| 主题 | 已通过源码确认 | 决策和后续验证 |
|---|---|---|
| 插件 | BB `js/plugin_loader.ts:1077–1112`，`Plugin.register`、`runOnLoad`、`BBPlugin` 别名 | 单入口 JS，`onload/onunload` 对称登记资源；注册失败只回收已取得的资源 |
| 独立模式 | BB `js/modes.ts:44–79, 158–164, 198–226`，`Mode` 挂载 Vue 组件、写入 `Modes.options`；`index.html:162–171` 遍历选项；`js/animations/animation_mode.js:918` 注册 animate | 宿主暴露 Mode 构造器，可注册独立模式。构造选项无位置参数，注册只写对象键；运行期 Vue 2 的响应式登记及紧邻动画的顺序均需要原型实验 |
| 工程与格式 | BB `js/formats/generic.ts:1` 使用 `free`；`js/io/project.ts:367` 按项目 mode 查找注册项；`js/formats/bbmodel.js:101,398,445,600` 提供 project codec 事件 | 避免卸载后工程仍指向插件 Mode；宿主原生模型数据走其原生 codec，工作流默认 sidecar |
| 菜单和布局 | BB `js/interface/menu_bar.ts:19–78,862` 有 BarMenu 和 Action 入口；`js/modes.ts` 调用侧栏更新；`package.json:191` 依赖 Vue 2.7.16 范围 | 注册独立菜单，核对哪些模式由 MenuBar.update 显示。使用 Mode.component 的工作区、宿主 Action 和主题；插件工具栏与快捷键限制在工作流焦点内 |

P0 顺序：先用 Mode、组件、Action 检查真实界面。若原生选项能显示但顺序失配，原型验证版本限定的响应式重排，记录对宿主选项和项目 mode 的影响。若原生入口无法稳定显示，保留 Mode 和 OMM 菜单入口，评估在已识别动画按钮附近挂载单个可移除入口。入口未达「动画后」就记录差异和证据，由产品决策是否接受；宿主 Fork 是需另行授权的最后备选。项目文档 Tab 属于工程切换语义，优先选择工作 Mode。正式卸载需恢复本插件占用的模式、快捷键、监听、Vue 实例、DOM、菜单、样式、引用；依据宿主 teardown 实际行为逐项配对。

## 4. OMM Lua 运行时与 API 清单

**已通过源码确认**：`org/figuramc/figura/lua/FiguraLuaRuntime.java:83–110,143–180` 加载 Base、Bit32、Table、String、Math 与编译器；内部 Debug 用于指令钩子。资源 `common/src/main/resources/assets/omni-morph/scripts/sandbox.lua` 声明 Lua 5.2 - Figura，清除 debug、dofile、loadfile、collectgarbage。运行时补充 require、listFiles、load/loadstring、打印、JSON、数学和 Lua 遍历兼容逻辑。Fabric `build.gradle:28–29` 打包 Figura LuaJ，目标 JAR 的 `META-INF/jars` 有 luaj-core 和 luaj-jse 3.0.8-figura。NeoForge `build.gradle:49–50` 的打包配置可作为后续差异对照，首版运行验收仅覆盖上述 Fabric 工件。

`FiguraAPIManager.java:135–146,221–248,268–288` 注册类型和 globals，`LuaTypeManager.java:30–44` 按白名单生成元表。追踪入口、返回对象、动态索引和别名后才能发布节点。事件注册依 `lua/api/event/LuaEvent.java:85–105`；具体事件名、形参、时机和返回约束以 `EventsAPI` 和事件分发调用点共同核对。模型入口 `Avatar.java:2037–2058` 在存在渲染树时注入 models。脚本运行以及 host、file、net、渲染与粒子 API 的权限分别从调用点、指令预算和每方法实现提取，禁止以全局名存在推定每个方法可用。

下表是首批清单。F 代表 `org/figuramc/figura/`，O 代表 `top/aihmc/omnimorph/`。版本列统一为所查源码的候选目标 alpha.12，逐条发布工件对照及实机结果由 P0/P4 输出；重载、精确返回和条件证据均进入版本清单。

| 原名 | 显示名 / 类别 | 参数 → 返回 | 来源 | 访问和可用条件 |
|---|---|---|---|---|
| math.floor | 向下取整 / 标准数学 | number → number | F lua/FiguraLuaRuntime.java:92，嵌套 LuaJ JseMathLib/MathLib | 基础数学库成员，P0 确认目标库导出 |
| math.clamp | 限制范围 / 扩展数学 | number, number, number → number | OMM 资源 scripts/math.lua:3 | 扩展数学资源加载成功 |
| math.lerp | 线性插值 / 扩展数学 | number, number, number → number | 同上 :7 | 同上 |
| require | 加载脚本模块 / 运行时 | scriptName:string → Varargs | F lua/FiguraLuaRuntime.java:245,366 | 仅当前模型脚本表，按路径解析、缓存、检测循环 |
| Event:register | 注册事件回调 / Figura 事件 | function, name?:string → Event | F lua/api/event/LuaEvent.java:85–105 | 有效事件对象；函数数目受限 |
| ModelPart:getRot | 读取旋转 / Figura 骨骼 | 无 → FiguraVec3 | F model/FiguraModelPart.java:417 | 可达 ModelPart |
| ModelPart:setRot | 设置旋转 / Figura 骨骼 | FiguraVec3 或 x,y,z → ModelPart | F model/FiguraModelPart.java:436 | 可达 ModelPart；重载以方法注解为准 |
| ysm_model:getPart | 查找 YSM 骨骼 / OMM YSM | name:string → YsmModelPart 或 nil | O lua/api/ysm_model/YsmModelAPI.java:35–39 | YSM runtime 存在且名字可解析 |
| ysm_model:isYsm | 判断 YSM / OMM YSM | 无 → boolean | 同上 :157 | 可访问 ysm_model |
| ysm_model:setTexture | 设置 YSM 纹理 / OMM YSM | id:string → YsmModelAPI | 同上 :143 | 实际效果依有效 YSM 模型及纹理 ID |

P4 按入口闭包展开并逐项对账：标准环境（基础、数学、位运算、字符串、表）、事件、模型骨骼、动画、renderer、particles、textures、avatar/player/world、YSM 和 OMM 扩展。动态字段、能力受限和上下文绑定条目给出证据或待核标记；第三方内部工具与不可达 Java 方法只纳入排除报告。API 文档注解用来补全签名和别名，运行派发是调用能力依据。每条保存 `origin/global/receiver/callStyle/overloads/returns/permissions/context/since/source/artifact`、文档键、中文名及状态。P0 库代码/资源对账清单与 P4 逐条审核后的首版全量清单是阶段交付物。

## 5. YSM 插件研究

**已通过源码确认**：YSM `src/index.js:9–36` 用 BBPlugin、Action 和 Molang 扩展；`src/import/file_import.js:9–35,82–151` 解析 files.player.model.main，处理字串/数组/对象形式纹理，并走 Animator.loadFile 导入动画和控制器。`load_normalization.js:150`、`save_normalization.js:222`、`old_version_transform.js:157` 分别是规范化读写、旧包转换入口；`src/molang/ysm_molang.js:1` 注册编辑器自动补全。OMM 的 `top/aihmc/omnimorph/avatar/ysm/YsmAvatarLoader.java`、`YsmAvatarMetadataParser.java` 与 `model/ysm/YsmGeometryParser.java`、`controller/YsmAnimationControllerParser.java` 是 P0 交叉核对运行时契约的入口。YSM 参考插件根许可证为 MIT，复制受保护代码时须保留许可与版权声明；本计划采用独立适配。模型、纹理和声音按各样本自身许可证处理。

## 6. 技术栈与选型

| 候选 | 优势 | 主要成本与验证 |
|---|---|---|
| Vue Flow | 有节点、端口、视口、小地图等组件；MIT | Vue 3 依赖须隔离宿主 Vue 2，测试包大小、键盘和 CSS 互扰。[官方文档](https://vueflow.dev/) |
| Rete.js v2 | 可选渲染器，区分数据与控制连接；MIT，逐包核对 | 插件组合成本，核对 Vue 渲染器 peerDeps 及自定义端口模型。[官方 Vue 指南](https://retejs.org/docs/guides/renderers/vue/) |
| LiteGraph.js | Canvas2D，宿主 Vue 无直接耦合；MIT | 检查高 DPI 文本、可访问性、自定义多执行出口、边和撤销适配。[上游仓库](https://github.com/jagenjo/litegraph.js) |
| 自研 Vue 2 + SVG/DOM | 宿主技术兼容，Graph 契约由项目掌控，SVG 连线和 DOM 文本便于调试 | 需要实现交互和裁剪；P0 用 500 节点/750 边测量，再决定是否把边渲染升级为 Canvas |

推荐 TypeScript、宿主 Vue 2 组件、DOM 节点和 SVG 边，图命令和 IR 与渲染器解耦。TS 编译、构建和测试依赖在 P0 固定具体版本及许可证；优先比较 esbuild 单脚本 IIFE 与 Vite library mode 的 CSS/资产、外部 Vue 和无动态分包能力。Vitest 用于纯业务测试，node:test 是工具链精简备选。Lua parser 首选试验 luaparse Lua 5.2 模式、范围和注释；若其遇到运行时合法语法，先基于差异 fixture 对照 LuaJ 编译，再决定补丁或更换 parser，保留原字节文本与诊断。[luaparse 上游](https://github.com/fstirlitz/luaparse)

## 7. 系统架构

宿主适配 → 工作区组件 → GraphStore/命令栈 → 节点注册/类型校验。编译链为 Lua → Parser/AST → IR → Graph，反向为 Graph → IR → emitter。IR 独立于宿主和渲染器，节点目录提供签名和调用规则。OMM/YSM 适配负责模型与封装路径。持久化层保存图、布局、Lua 同步基线与诊断，测试以纯模块和真实宿主操作分离。包内 Lua 解析为文本处理，编辑器不执行导入的脚本。

## 8. UI 与 Penpot 规格

设计交付为 Penpot 原型规格。桌面参考画板 1440×900 和 1280×720：顶部 44 px 工具条，左侧 256 px 节点/脚本库，可折叠右侧 320 px 属性面板，中间画布，左下 160×100 px 小地图。主题采用宿主 CSS 变量，组件 class 以 omm 前缀隔离。节点宽 200–320 px、端口热区至少 24 px，执行流和数据接口使用形状及文字区分；节点拖拽、快捷键和缩放以画布焦点为边界。工具栏提供保存、导入、导出、撤销/重做、适配视图和诊断。库按类别折叠、搜索支持中文/原名，拖入与键盘添加共享命令。画布有平移、缩放、框选、多选、对齐、分组、复制、断连、删除和小地图导航。世界坐标与视口矩阵独立，按视口裁剪，拖动更新经 requestAnimationFrame 合并，松手后提交一次撤销命令。

原型帧依次覆盖空项目、搜索弹窗、连线校验、自定义脚本参数/正文编辑、子图面包屑与接口编辑、Lua 导入诊断、导出预览和冲突处理、OMM 模板菜单、YSM 检查面板。标注默认/焦点/错误/禁用态以及 125% DPI 和 CJK 截断。真实桌面验证操作与截图需求在 P1/P2 记录。

## 9. 节点系统与首版自定义 Lua 节点

节点定义用稳定类型 ID，实例用持久 UUID，端口使用独立稳定 ID。端口签名包含方向、种类、类型、顺序、可选性、默认值和 Lua 标识符。基础节点覆盖常量、变量、赋值、条件、循环、函数、事件和表。节点搜索来自审核目录。数据端口连线检查类型及单输入，流程端口检查结构化块关系；语义循环通过显式循环节点表示。未知节点保留原 JSON 与边，用占位节点和诊断显示；禁止将未知语义当作正常导出。

**自定义 Lua 脚本节点（P2 编辑、P3 正式可导出）**：

- 用户编辑具名有序输入与输出（含类型、默认值/可选性和可空描述）、执行模式及完整 Lua 正文。端口改名保留 ID 和连线，删端口须显示受影响的边，变更作为一个可撤销命令。先提供 `value`（显式绑定的取值模式，无流程口）与 `statement`（上游触发、有流程输入/输出）；输出在两种模式均可声明，有序 return 映射端口。没有显式保证纯度的 value 节点也按 IR 调度执行，不因多个消费者重复求值；跨分支不可支配的消费报诊断。
- 正文按用户写入的文本保存，包含空白、注释、空行和换行；文件导入时另留原始字节引用及编码信息。正文视为 Lua 函数体，输入绑定为形参，输出用 return。在目标方言中解析，校验重名、保留字、未绑定的显式捕获、作用域及可静态确认的输出错误。全局使用沿目标 Lua 环境语义。函数定义和参数名防冲突，正文按原文插入并确保尾部换行，避免注释吞掉 end 或改变长字符串内容。调用的参数和多返回用 IR 求值次序生成，固定返回槽保留 nil 和缺位语义。原始 Lua 节点则保留原作用域/源码边界，避免借自定义函数包装改变原脚本语义。
- 导出同时输出可选回导清单，供恢复时使用。运行 Lua 中仅放可安全定位的注释 ID 标记；清单记录文件、稳定节点/端口 ID、版本、模式、源码范围和片段哈希、正文及连接/布局。恢复须验证唯一标记、适配元数据版本、匹配的签名和可验证的范围/生成结构。Lua 有可识别的外部正文修改时进入差异预览，用户接受后沿用原 ID 并采纳新正文。清单缺失、重复 ID、元数据损坏、结构改写或范围无法确认时，将实际输入文本保留为原始 Lua 节点，附文件、范围、原因和恢复建议；范围不可靠时保留完整文件为原始节点。禁止用清单旧正文静默覆盖导入源码。原始块无法安全重排或重新绑定时，允许原文件逐字节导出并拒绝有风险的重生成。
- P3 验收以两个模式、两输入两输出、nil、多返回、闭包、正文注释/长字符串、端口变更、同一图节点 fan-out、文件改写、缺清单及伪造/重复标记覆盖。验证项目序列化往返字节等价（UTF-8 正文）、目标 Lua 语义、ID 恢复与不丢码诊断四项。

## 10. Lua 双向转换

Parser 保存 token/range/注释与 AST；AST → IR 负责作用域、符号绑定、块结构、表达式、赋值上下文、多值、尾位置、循环中断与 return。IR 含 `Block/Assign/If/Loop/Function/Call/Table/Return/Callback/Opaque` 等结构，并记录 source span、字段原名及冒号/点调用。Graph → IR 根据执行关系和数据依赖拓扑检查可达性、求值顺序及变量可见性，生成器处理优先级、括号、Lua 标识符、事件回调和模块路径。导入 Lua 的动态索引、元表、闭包、高阶函数、可变参数、多返回和动态调用按结构可还原性分级。受支持表达式可视化，已解析但未支持的结构保留 AST 范围与完整源码，语法错误或未知方言进入文件级原始节点。未知 API 保留原调用。不能安全拆块的闭包捕获或多语句保留最小语义闭合父块及其诊断。

分别记录文本字节一致、语法通过、规范化 AST 一致、真实运行语义等价。图往返仅在有可信元数据时承诺布局与稳定 ID 恢复。Lua 格式可规范化，原始保留块按原字节或同编码无损写回；禁止丢弃调用、注释与用户源码。

## 11. 子图与脚本库

子图有稳定 ID、名字、接口版本、明确输入/输出、独立局部作用域和引用列表。支持导航、嵌套、复用、重命名及库导入；改名沿 ID 更新引用，接口变更列受影响调用点。拒绝静态循环依赖或路径冲突；动态 require 按原语义保留，诊断表达无法静态确定。

**已通过源码确认**：`FiguraLuaRuntime.java:245–260,366–390,424–435` 的 require 使用 ScriptPath 和调用脚本目录解析、检测循环、从脚本表读取、缓存 Varargs，向模块传入目录与文件名；自动脚本列表可控制初始化入口。`Avatar.java:2037–2058` 接入 scripts NBT 与 metadata.autoScripts。**需要原型实验**：以 `ScriptPath.java` 和目标模型装载路径验证无后缀模块名、根/相对路径及自动执行目录。默认子图发布到 `libs/<slug>.lua`，模块顶层只返回函数/表，防止被自动扫描时产生额外副作用；导出入口清单只列主脚本，实机核对 metadata 载入，验证两次 require 的缓存与返回值。路径结果由 runtime profile 固定。

## 12. 模型格式与持久化

保持 Generic Model；项目图保存为 `<model>.omm-workflow.json`，另将 Lua 输出到用户显式选择的导出目录，回导清单放在编辑源侧，运行包只纳入可加载资产。优先采用独立文件因插件缺席时宿主对自定义 bbmodel 字段的保留尚无证据；可选 bbmodel 扩展待 P1 codec 实验后再评估。绑定采用用户选定工程路径和资源 UUID/原名/层级定位，Save As 时显式迁移，歧义让用户重绑。工程画布可独立保存；schema 迁移按版本逐步执行，源文件备份并报告不兼容，未知记录原样保留。工作流写入使用同目录临时文件及替换；多文件先校验整套输出，再生成发布目录，旧导出保留至成功。外部 Lua 与导出基线哈希变化时三方显示图生成结果、缓存基线和外部代码，提供重新导入、另存和取消，覆盖需显式确认。

## 13. OMM 菜单与模板

| 入口 | 模型 | 行为与契约 | 阶段 / 难度 |
|---|---|---|---|
| Lua 工作流 | Generic/可识别 YSM | 切换 Mode 或回退入口，加载当前工作流上下文 | P1 / 中 |
| 新建 OMM 模型 / Figura 模板 | Generic | 创建原生工程，添加数据化模板和工作流绑定；导出 OMM 文件时走运行时格式校验 | P6 / 中 |
| YSM 模板 | 已支持 schema | 创建骨骼、纹理槽、动画/控制器占位与清单 | P6 / 高 |
| Lua / 动画 / 骨骼模板 | Generic 或模板声明支持的 YSM | 应用经验证的模板规格；修改原生模型时使用原生 Undo | P6 / 中 |
| 装饰品 / 粒子模板 | 目标配置可用时 | 确认打包及节点契约后加入；首版候选 | P6 后 / 高 |
| 导出模型 | 模板声明支持的格式 | 预览产物、引用和目标版本；YSM 受限格式逐项列出不支持字段 | P6 / 高 |
| 模型检查 / API 参考 | 工作流支持的模型 | 输出骨骼、纹理、动画及 API 兼容诊断；API 参考使用同一目录 | P4、P6 / 中 |

## 14. YSM 支持方案与真实样本

支持 spec 2 的主/手臂与额外几何、纹理、动画、控制器、元数据、Molang 源文、骨骼与定位点查验。识别旧目录后提供只读映射、预览和独立输出转换；未知扩展备份并报告。关系用模型资产 ID 及骨骼层级定位，重名报歧义。Molang 首版编辑语法/自动补全、保留原值及引用。通用 Lua → Molang 求值节点暂不支持；P0 查找可达白名单后才决定是否增加特定桥接。运行时环境、动画状态机、游戏实体和权限在真实 OMM 使用路径验证。

| 样本（refs/models 下） | 验收 |
|---|---|
| YSM_NEW_Model/ysm.json | spec 2 模型、纹理、主/手臂与元数据完整；输出重新解析后对照源 |
| 03_astronaut/ysm.json | 控制器、动画引用及 CJK/纹理可视检查，从工作流定位骨骼；样本不可随包发布 |
| 01_taisho_maid、02_new_year | 额外资源与多个纹理、语言字段保留，从实际清单捕获 golden 字段 |
| YSM_OLD_Model | 基于 main/arm/动画/PNG 识别旧目录，转换输出到隔离路径，无法映射的字段给诊断 |
| 根目录 ZIP | P0 只读盘点路径、模型格式、脚本及许可；选包含 Figura 工程的已授权样本走真实导出链，若无则从已授权模型派生最小 Generic 验证样本并记录映射 |

## 15. 文件级实现清单

以下为计划路径。输入 → 输出和验收均用于实施分派。

| 路径 | 阶段 | 职责 / 主要接口，依赖与验收 |
|---|---|---|
| docs/source-baseline.md | P0 | 工作树和 JAR → 版本、证据、API 候选与实验结论；可追溯到符号与工件 |
| docs/ui-prototype.md | P0/P1 | 规格 → Penpot 帧与定位证据，覆盖脚本编辑和回导异常 |
| package.json、tsconfig.json | P1 | 锁定 TS 和工具链，提供显式 Windows build/test 入口；类型检查通过 |
| scripts/build.mjs | P1/P7 | 插件入口和资源 → 单 JS/发布清单，Vue 外部化校验 |
| src/plugin/main.ts | P1 | registerPlugin → 安装/释放 host adapter；输出资源登记清单 |
| src/blockbench/workspace.ts | P1 | registerWorkflowMode(host) → Mode 和 UI 挂载释放句柄；正确映射项目 |
| src/blockbench/menu.ts | P1/P6 | registerOmmMenu(actions) → 菜单与条件 Action；实际菜单入口操作可达 |
| src/blockbench/model-bindings.ts | P6 | resolveBinding(model,ref) → 唯一元素或诊断；歧义不误绑 |
| src/ui/WorkflowWorkspace.vue | P1/P2 | 项目会话 → 工作区、工具区、库和属性编排 |
| src/ui/GraphCanvas.vue | P2 | graph/viewport → 可裁剪画布与小地图，经命令触发连线及编辑 |
| src/ui/NodeLibrary.vue | P2/P4 | NodeRegistry → 搜索、分类、拖放/键盘插入 |
| src/ui/ScriptNodeEditor.vue | P2/P3 | 端口、模式与正文 → 单事务修改，错误位置可定位 |
| src/ui/ImportExportDialog.vue | P3 | 文件/基线/候选 → 预览、诊断和显式合并结果 |
| src/workflow/schema.ts | P1/P2 | GraphDocument、PortSpec、SourceSpan → 可版本化 JSON |
| src/workflow/store.ts | P2 | apply/undo/redo(command) → 新状态与诊断；移动与批操作原子撤销 |
| src/workflow/validate.ts | P2/P3 | 图和签名 → 类型、执行流、标识符和支配错误 |
| src/nodes/registry.ts | P2/P4 | builtin/manifest → 去重 NodeDefinition 注册表 |
| src/nodes/custom-script.ts | P2/P3 | 校验自定义节点 → 函数体 IR 或位置诊断 |
| src/lua/parser/index.ts | P3 | parseLua(source,profile) → AST/ranges/tokens/diagnostics |
| src/lua/ast/lower.ts | P3 | AST + scope → IR，保留不透明块的边界和源文 |
| src/lua/ir/model.ts | P3 | 共享 IR 与符号表示；多返回、闭包、结构化流程可表达 |
| src/lua/ir/graph.ts | P3 | graphToIr/irToGraph → 图或 IR；映射失配有诊断 |
| src/lua/generator/emit.ts | P3 | emitLua(IR,profile) → Lua 与范围映射 |
| src/lua/roundtrip.ts | P3 | recoverNodes(source,manifest) → 恢复匹配或原始 Lua、诊断 |
| scripts/extract-omm-api.mjs | P4 | 源树和 JAR 元数据 → 候选、排除项、来源及版本差异 |
| src/api/catalog.ts、src/api/compatibility.ts | P4 | 审核目录 → 节点定义、版本权限诊断；未知条目可保留 |
| assets/api/<profile>.json | P4 | 审核签名条目 → 版本化目录，可核对证据与覆盖率 |
| src/workflow/subgraphs.ts | P5 | 接口与 DAG → 调用图、变更影响和循环诊断 |
| src/lua/generator/modules.ts | P5 | 子图 DAG、profile → 主脚本、libs、自动脚本清单 |
| src/templates/catalog.ts | P6 | 消费结构化模板规格 → Generic/YSM 草稿，验证资源引用 |
| src/ysm/pack.ts、src/ysm/normalize.ts | P6 | 探测、规范化及受限写出；保留未知数据，禁止越出选择目录 |
| src/persistence/workflow-file.ts | P1/P3 | decode/migrate/save → 工作流/版本诊断；原始节点和正文可无损写回 |
| src/persistence/export-plan.ts | P3/P5 | 图/文件/哈希 → 发布计划/冲突，失败保留旧产物 |
| tests/workflow.test.ts、tests/lua.test.ts | P2/P3 | 纯业务 fixtures → 操作、语义和往返断言 |
| tests/catalog.test.ts、tests/modules.test.ts、tests/ysm.test.ts | P4–P6 | 目录、模块、模型业务断言，分别运行 |
| tests/fixtures/ | P2–P7 | 自有最小 graph、Lua 和预期结果；本地真实资产用 refs 引用 |
| assets/icons/workflow.svg、docs/validation.md | P1/P7 | 模式图标、实际操作证据、适用版本及手工未验证项 |

## 16. 数据结构与接口

```ts
type Port = {
  id: string
  name: string
  type: string
  direction: 'input' | 'output'
  kind: 'data' | 'flow'
  optional?: boolean
  defaultValue?: LuaLiteral
}
type ScriptNode = {
  id: string
  type: 'core.customScript'
  revision: number
  mode: 'value' | 'statement'
  inputs: Port[]
  outputs: Port[]
  source: string
}
type GraphDocument = {
  schemaVersion: number
  targetProfile: string
  graphs: Graph[]
  model?: ModelBinding
  exportBaseline?: ExportManifest
}
type Edge = { from: Endpoint; to: Endpoint }
type Endpoint = { nodeId: string; portId: string }
type Diagnostic = {
  code: string
  severity: 'info' | 'warning' | 'error'
  nodeId?: string
  source?: SourceSpan
  message: string
}
```

Graph 保存节点布局、分组、注释及视口。IR 保存符号引用与作用域，Opaque 保存原文本与源范围，必要时冻结相关块的结构编辑。ExportManifest 保存版本、图身份、文件哈希、映射与冲突基线。数据层负责字段校验；Renderer 仅消费状态及产生命令。

## 17. 核心伪代码

```text
1 registerPlugin:
  BBPlugin.register(id, onload=install, onunload=dispose)
  install: append each acquired resource and disposer immediately
           on error dispose acquired resources in reverse order and report
  dispose: restore prior valid host mode for affected projects, release owned
           listeners, UI/shortcuts, mode, actions, menu and CSS in reverse order

2 registerWorkflowMode:
  create Mode(id, condition=activeSupportedProject, component=workspace)
  apply P0-verified registration and placement for this host profile
  onSelect bind active project graph; onUnselect clear workflow keyboard focus
  return disposer for plugin Vue instance, screen, mode and owned bindings

3 registerOmmMenu:
  actions = construct capability-scoped Action for each enabled manifest entry
  create BarMenu(id, actions), update with verified host menu visibility hook
  each Action runs preflight against current project, directory and target profile

4 loadNodeDefinitions:
  validate builtin IDs and manifest schema; reject duplicate type/port IDs
  install verified definitions with profile predicates and emission descriptors
  keep unresolved document nodes with original payload and edges

5 discoverApi:
  read JAR metadata and nested class member names without loading classes
  trace configured globals, accessible return types and whitelist registration
  merge runtime libraries, annotations, resources, aliases and permission evidence
  emit candidates and exclusion reasons; only approved candidates ship

6 parseLua:
  parse under profile grammar with comments and source ranges
  on parse error return original source and span diagnostic

7 astToIr:
  bind symbols to lexical scopes; lower known syntax using Lua arity rules
  if a statement cannot lower, enclose the smallest scope-safe raw source span

8 irToGraph:
  project supported blocks to nodes and typed execution/data edges
  for opaque block attach source span and diagnostic, freeze unsafe rewiring

9 graphToIr:
  validate structured flow, data dependencies and execution dominance
  lower by symbol identity and original order; bind each script output once per execution
  block export when unknown nodes or unsafe opaque moves change semantics

10 emitLua:
  serialize precedence, call convention, assignment and return arity
  write custom Lua body literally inside declared function scope
  emit safe ID markers and collect file/range/signature/body hash in manifest

11 exportModules:
  resolve graph IDs, detect SCC cycles and case-insensitive path collisions
  generate dependency calls with verified ScriptPath profile
  emit module return tables, entry scripts and explicit autoScripts plan

12 saveRestore:
  validate document and compare on-disk baseline; write temporary file then replace
  restore or migrate documented schema version; retain unknown records
  compare Lua baseline, imported text and regenerated text before any overwrite

13 recognizeYsm:
  parse ysm.json and check supported spec plus file references
  else detect documented main/arm legacy structure
  normalize with original raw fields and report missing, unsupported or ambiguous refs

14 checkCompatibility:
  resolve node definition against artifact profile and evidence status
  compare overload, receiver, feature flags and context conditions
  emit errors for unavailable required APIs and diagnostics for runtime-only conditions

15 recoverCustomNode:
  locate unique stable ID markers and validate manifest and exact source scope
  if digest and structure match, restore original node/port IDs and complete body
  if supported body-only edit, stage new body and retain IDs on explicit acceptance
  otherwise keep actual source span as RawLua with reason; if uncertain preserve whole file
```

## 18. 里程碑与实施顺序

各阶段完成自动验收后更新进度、检查 git status/git diff、独立提交、推送并核对远端 SHA，再进行下一阶段。人工项记录后可推进。按 P0 → P1 → P2 → P3 → P4 → P5 → P6 → P7 执行。

| 阶段 / 依赖 | 实施步骤与文件 | RED | GREEN 与完成判定 / 主要风险 |
|---|---|---|---|
| P0 / 本地参考 | docs/source-baseline.md、docs/ui-prototype.md；固定宿主/JAR，探 Mode、菜单、编译方言与模块加载，盘点样本，确定依赖和许可 | 记录缺失的定位、方言、模块和样本证据，列最小业务 probe | 证据表、宿主入口路线、版本基线和 fixture 清单可复核，人工记录照实；风险为排序和来源版本漂移 |
| P1 / P0 | package、build、plugin、blockbench、workspace、schema、workflow-file；搭建空图及保存入口 | 非法 schema/写失败报错，菜单入口无法进入时有可观察结果 | 单文件构建，业务数据保存正确，真实界面检查列入验收记录；风险为宿主 Vue/项目模式 |
| P2 / P1 | GraphCanvas、NodeLibrary、ScriptNodeEditor、store、validate、registry | 非法边、复制 ID 冲突、删端口断链、撤销状态差一项均能检出 | 图操作测试通过；脚本节点双模式、参数和正文可编辑保存；性能基准与 CJK 桌面验收留证 |
| P3 / P2 | parser、IR、emitter、roundtrip、导出预览和文件计划 | 优先级、多返回、作用域、未知节点、正文丢失、重复 ID 或外部编辑分别触发 | Golden 和目标语法、文件哈希冲突、安全降级与双模式数据流通过；真实语义归 P7 核对 |
| P4 / P3 | extractor、catalog、compatibility、assets/api | 用未注册 Java 方法、不可用版本、同名不同重载验证拒绝 | 可达项与排除项对账，清单字段完整，选中典型节点生成正确调用；风险为权限条件误判 |
| P5 / P4 | subgraphs、modules、export-plan | 循环引用、路径冲突、接口破坏、缺失模块 | 简单/嵌套模块输出稳定、依赖可追踪、坏输入给诊断；与 OMM 加载语义待实机证据 |
| P6 / P5 | model-bindings、templates、ysm、菜单 | 缺字段/文件、重名骨骼、未知 schema、旧目录转换丢数据 | 真实本地样本业务断言通过，受支持项目输出独立目录，保留扩展字段或显式拒绝丢失 |
| P7 / P6 | build、validation、fixture 记录 | 对照 P3–P6 确认不支持组合与异常诊断，验证打包前缺件失败 | Windows 产物与哈希、支持矩阵、真实用户路径结果；人工结果单列，生命周期测试 SKIPPED（用户禁止） |

## 19. RED/GREEN 与真实环境验收

先对本阶段业务行为建立可失败断言，再完成实现并重跑受影响套件。未来 Windows 构建、打包和测试均使用 PowerShell 前台，命令 `& <command> 2>&1 | Tee-Object -FilePath "build.log"` 后立即检查 `$LASTEXITCODE`，失败读取日志。显式选择业务套件，生命周期测试一律 SKIPPED（用户禁止）。禁止本地 WSL、非 Windows 构建。

真实桌面验证在获准的单次 Blockbench 会话中完成：打开模型，查看模式位置和 CJK，添加与连线两个执行模式的脚本节点，编辑签名和正文、保存、导出、导入并检查 ID 和损坏清单诊断，同时编辑原生骨骼/动画。等待稳定渲染后仅在需证据时截取可见窗口，记录 DPI 与操作，结束后关闭。适用 Qt 校验也使用正常 Windows 平台窗口，禁止 offscreen。画布基准建议 500 节点/750 边、稳定渲染后 5 秒平移记录 p95 帧间隔，目标 ≤33 ms，记录设备和 DPI 并在 P0 确定测量方法。

真实 OMM 业务验证在获准的游戏环境执行代表性样本的节点输出、事件、模型变换、动画、YSM 材质关联、模块缓存及自定义脚本两模式。每条记录预期效果、游戏日志与产物；编辑器预览和编译通过单列。人工、实机未执行记 MANUAL/PENDING，用户明确跳过记 SKIPPED，均不充当自动阶段门槛。

## 20. 风险与待确认项

| 风险 | 优先规避 | 降级 / 验证 |
|---|---|---|
| 宿主内部变化、动画后 Tab | P0 比对 Mode、Vue 响应式和选择器 | 菜单入口及版本限定适配；真实窗口核对位置，需产品批准接受差异 |
| Vue、节点引擎、CSS 冲突 | Vue 对齐、插件样式作用域、纯图状态 | 减少外部渲染依赖；检查原模型输入、中文及宿主快捷键 |
| Lua 方言与动态语义 | 目标 LuaJ 工件编译、源范围保留 | 原始节点与诊断；用闭包、元表、变参和多返回 fixtures |
| OMM/Figura API 更新、权限 | 分版本目录与源码/工件差异 | 对不可用条目提示、保留未知调用；真实有权/无权业务路径验证 |
| YSM 格式和 Molang 差异 | schema 探测，保留未识别字段 | 只读报告、编辑源串；旧/新格式 fixture 和真实样本检查 |
| 模块与多文件导出 | DAG、路径规范化、显式入口、先验证后发布 | 路径未证实则阶段内核验；导出失败保留旧目录，模块 fixtures 对照运行 |
| 模型兼容及数据覆盖 | sidecar，显式绑定、原生格式 codec | 独立输出和冲突 UI；测试未修改原始模型 |
| 大图性能 | 视口裁剪、批处理、限制同步 DOM 更新 | 按实测优化局部渲染层；记录 p95 与丢帧 |
| 许可证与素材 | 逐包许可、模型使用授权、依赖清单 | 使用自有 fixtures；发布清单检查素材范围 |
| 未知节点、脚本恢复 | 稳定 ID、版本化清单、完整源码 | 原始 Lua 保留、诊断和有歧义时冻结编译；篡改/缺失清单测试 |

## 21. 推荐实施路线

先锁定目标宿主和 LuaJ 工件，验证 Mode 相邻位置、菜单和脚本装载协议。用一个可保存的图打通节点编辑与 Lua 转换，优先完成自定义脚本双模式、稳定 ID 回导和原始代码回退。再扩展经审核的 API 目录、模块和 YSM/Generic 工具。阶段收尾以真实操作的证据、可复现运行产物和记录完备的状态为准。
