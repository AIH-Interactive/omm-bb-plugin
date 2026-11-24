# Lua 节点化清单与 for 实现

适用于 OMM_BB_Plugin。目标基线为 Blockbench 5.2.2、OMM Fabric 1.0.0-alpha.12+26.1.2，目标 JAR 内嵌 Figura LuaJ 3.0.8-figura。此文是节点库和循环编译的设计清单。节点可见性由目标工件、脚本身份、权限与调用上下文共同决定。

## 1. 节点表示

| 表示 | 适用内容 | 生成或执行方式 |
|---|---|---|
| 表达式 | 字面量、运算、读变量、读字段、已确认可重算的纯函数 | 有序表达式 IR，保存优先级与多值上下文 |
| 执行节点 | 写变量、状态读写、有副作用的调用、可能抛错或调用用户逻辑的操作 | 有明确执行位置，结果绑定临时变量；多消费者共享一次求值 |
| 结构化块 | 分支、循环、函数、事件、子图 | 节点拥有独立 Block/Scope，生成原生 Lua 语法 |
| 工程节点 | 当前骨骼树、动画帧、轨迹预览、控件模拟 | 消费只读 Blockbench 快照与本地模拟状态；支持的绑定才转换为运行时 Lua |
| 脚本节点 | 用户指定输入、输出、执行模式和 Lua 正文 | 声明函数体，保持代码原文、词法作用域与有序返回 |
| 原始 Lua | 无法安全结构化的语句、未知语法和回导失败的代码 | 保存原文与语义边界，附诊断；无法安全重排时保留所在块或整文件 |

运算符可能触发元方法。对未知类型上的索引、算术和比较保留原求值次数及顺序。以规范名称注册节点，别名用于搜索。API 节点应保存 Lua 调用名、接收者、重载、参数、返回、版本、权限、事件上下文、源码锚点及验证状态。动态返回对象和白名单声明要先证明实际可达。

## 2. Lua 语言与基础库节点

| 类别 | 可节点化项目 | 关键约束 |
|---|---|---|
| 常量与类型 | nil、boolean、number、string、空表、函数值、userdata 引用、类型判定 | 保持 nil 槽位；字面量保留转义和长字符串；Lua 真值只有 false/nil 为假 |
| 变量与赋值 | 局部声明、读写局部、全局读写、上值、并行赋值、交换、解构多返回 | 同名变量按符号 ID 绑定；右侧先求值；保留尾位置返回个数调整 |
| 运算 | 加减乘除、取模、幂、负号、连接、长度、等于/不等、大于/小于/边界比较、and/or/not | and/or 短路且返回原值；保留运算优先级、连接/幂结合方向 |
| 表 | 构造、数组项、命名字段、动态键、读/写/删、追加、计数、拷贝、顺序迭代和键值迭代 | 复制与计数可做子图；有空洞时长度语义依 Lua 表边界；动态索引保留元方法 |
| 条件与块 | if/elseif/else、do、短路分支、基于 if 的多路选择 | 分支后值用外层变量或显式合并 |
| 循环 | 数值 for、ipairs、pairs、通用迭代器 for、while、repeat-until、break | 块作用域；repeat 条件可见块内局部变量；Lua 5.2 无原生 continue |
| 函数 | 局部/全局函数、匿名函数、闭包、普通/冒号调用、动态函数调用、递归、变参、return、多返回 | 调用风格、self、捕获、尾返回、多值调整须进入 IR |
| 高级控制 | pcall、xpcall、assert、error；goto/label 的保留 | goto 跨块时保留语义闭合源块，首版不允许画任意跳转连线 |
| 迭代与原始访问 | next、pairs、ipairs、type、select、tonumber、tostring、rawequal、rawget、rawset、rawlen、getmetatable、setmetatable | 注册前核对目标 LuaJ；pairs/ipairs 使用运行时同名全局，不假定标准实现 |
| 数学 | abs、ceil/floor、min/max、sqrt、pow、exp、log、sin/cos/tan、asin/acos/atan/atan2、deg/rad、fmod/modf、frexp/ldexp、random/randomseed、pi/huge | 按 LuaJ 实际函数表审核；随机状态有可观察副作用 |
| Figura 数学扩展 | clamp、lerp、round、map、shortAngle、lerpAngle、sign、playerScale、worldScale | 对应 `assets/omni-morph/scripts/math.lua`；保留大小写 |
| 字符串 | byte/char、sub、len、lower/upper、reverse、rep、find/match/gmatch/gsub、format | Lua 模式与 JavaScript 正则语义各自处理；gsub 返回替换结果与计数，gmatch 返回迭代器 |
| 表库 | insert、remove、sort、concat、pack、unpack | sort 分支保留用户比较器；pack/unpack 保留 `n` 与 nil |
| 位运算 | bit32.band/bor/bxor/bnot/btest、lshift/rshift/arshift、lrotate/rrotate、extract/replace | 依 LuaJ 的 32 位规则；核对边界参数 |
| 模块与调试输出 | require、listFiles、print/log、打印表、JSON 输出与解析、load/loadstring | 模块由 OMM 脚本表解析；动态加载仅走目标运行时语义，编辑器模拟期间不执行用户 Lua |
| 上下文限制 | io、os、package、coroutine、debug、dofile、loadfile、collectgarbage | 目标构造器的已加载库、运行时补充和沙箱为依据；未证实的库不开放，后四个名称由沙箱明示清除 |

定位：OMM `org/figuramc/figura/lua/FiguraLuaRuntime.java:83–110,143–245,366–390` 和 `common/src/main/resources/assets/omni-morph/scripts/sandbox.lua`。标准语法参照 [Lua 5.2 手册](https://www.lua.org/manual/5.2/manual.html)。

## 3. 模组 API 节点目录

下表覆盖运行时的注册域及常用可表达能力。具体方法和重载以本文件末尾的白名单源码索引和接收者证据确认。路径以 `refs/omni-morph/common/src/main/java` 为基准，F 为 `org/figuramc/figura`，O 为 `top/aihmc/omnimorph`。

| 域 | 节点分组 | 源码入口 / 发布门槛 |
|---|---|---|
| 事件 | 实体初始化、Tick、世界 Tick、渲染/渲染后、世界渲染/渲染后、键盘、字符、鼠标移动/按下/滚轮、物品使用、箭/三叉戟/物品/头颅渲染、声效、资源重载、图腾、受伤、聊天收发；注册/移除/清空回调 | F `lua/api/event/EventsAPI.java` 注册，`LuaEvent.java` 派发；逐事件核对回调形参与返回，包括聊天流水线 |
| Figura 模型 | 模型根和子部件查找、父子关系、名称、pivot、局部位置/旋转/缩放、偏移、动画位姿、可见性、纹理/改色、光照、透明、渲染类型、法线/世界矩阵 | F `model/FiguraModelPart.java`；`Avatar.createLuaRuntime` 注入 models；`partToWorldMatrix` 追踪求值时机 |
| 原版部件 | HUD 之外的原版模型组、可见性、原版部件变换与匹配 | F `lua/api/vanilla_model/`；确认部件名、有效渲染对象和可写字段 |
| 动画 | 查找/枚举动画、获取播放中动画、播放/暂停/停止/重播、循环、速度、时间、长度、混合、优先级和关键帧查询 | F `lua/api/AnimationAPI.java` 与实际 Animation 类；按版本和对象白名单分组 |
| Molang 桥接 | `animations:evalMolang`、`getMolangVar`、`setMolangVar`、`setMolangVars`、`getMolangVars` | F `lua/api/AnimationAPI.java:96–184` 源码确认有桥接，目标 JAR 仍需核对；求值取首个表达式，异常/无上下文在该实现可返回 0，因此 0 无法区分原因 |
| 自定义控件 | 开关、滑块、枚举、颜色、文本、数字、键绑定、按钮、标签、分隔；控件页/分类、范围/步长/默认、值读取/写入/重置、点按、变化回调、目标页导航 | O `lua/api/avatar_controls/AvatarControlsAPI.java` 和 `avatar/control/AvatarControlDefinition.java`；控件 ID 与默认图节点稳定绑定 |
| YSM 模型 | 模型类型、根/骨骼/定位点/挂点枚举与查询、骨骼/定位点/挂点世界位置及矩阵、纹理 ID、原生状态机开关、动画启停、控制器状态/时长、动作与同步键查询 | O `lua/api/ysm_model/YsmModelAPI.java:35–366`，对象返回可能为空；只在对应支持的模型上启用 |
| YSM 附属 API | YSM 显示状态、动作定义/查询/控制及子实体数据 | O `lua/api/ysm_model/YsmDisplayAPI.java`、`lua/api/ysm_actions/YsmActionsAPI.java`；跟踪作用对象、脚本身份和生效范围 |
| 向量/矩阵 | Vec2/3/4 构造、分量、点积、叉积、长度、归一化、距离、插值、转换；矩阵构造、乘法、逆、转置、向量变换 | F `lua/api/math/` 和 `math/vector/`、`math/matrix/`；区分写入自身的方法与新值 |
| 粒子和拖尾 | 原版粒子、自定义/纹理粒子、生成/移除、位置/速度/颜色/重力/缩放/生命周期；自定义粒子回调、动画图集、ribbon 参数按可达 API 分别审核 | F `lua/api/particle/ParticleAPI.java`、`LuaParticle.java`；O `lua/api/particle/` 的渲染实现只作为行为证据；编辑器轨迹与运行时 ribbon 有各自的验证 |
| 纹理与渲染 | 纹理查询/创建、尺寸、像素读写、更新、材质与叠加配置、相机/视角参数和渲染状态 | F `lua/api/TextureAPI.java`、`TextureAtlasAPI.java`、`RendererAPI.java`；区分读取、写入和宿主限定 |
| 声音 | 播放/停止、查询、音量、音高、位置、循环和声源参数 | F `lua/api/sound/`；源和权限影响可用性 |
| 玩家与实体 | 位置/速度/旋转、朝向、状态、装备、生命信息、本地与观察者信息，模型拥有者属性 | F `lua/api/entity/`；接收者由运行时注入或查询返回，区分 absent 与 nil |
| 世界与射线 | 时间/维度、方块/生物群系/物品属性、实体查询、方块/实体射线；命中解包 | F `lua/api/world/`、`RaycastAPI.java`；动态世界查询带执行上下文 |
| 输入与操作轮 | 按键注册/查找、按下/释放、当前按键状态；动作轮、页、图标、标题、颜色、按键与滚动回调 | F `lua/api/keybind/`、`action_wheel/`；操作轮页与 OMM 控件页有不同对象类型 |
| 名牌与 Avatar | 名牌文本和显示样式；当前 Avatar 元数据、状态、指令/权限信息及受支持的属性 | F `lua/api/nameplate/`、`AvatarAPI.java`；区分全局对象与具体名牌实例 |
| 本地客户端与 Host | 版本/时间/窗口和客户端属性；按可用权限显示本地消息、宿主输入、宿主动作 | F `lua/api/ClientAPI.java`、`HostAPI.java`；宿主、访客、饰品配置分别校验 |
| 通信与数据 | pings 的注册与发送、config 保存/读取、JSON 序列化、资源读取、buffer/stream/future；file 与 net 按权限分支 | F `lua/api/ping/`、`ConfigAPI.java`、`lua/api/json/`、`lua/api/data/`、`FileAPI.java`、`lua/api/net/`；异步完成、失败独立执行口；快照模拟不执行 I/O |
| 饰品实例 | 独立状态、控件、动画、饰品可用的客户端/纹理/模型能力 | O `lua/api/Cosmetic*API.java` 与 F `lua/FiguraAPIManager.java:253–303`；按 `cosmeticContext` 和预览身份筛选 |
| 入口扩展 | 其他模块注册的 globals、类型和事件 | F `lua/FiguraAPIManager.java:259–305` 及实际工件 entrypoint；未安装时该节点不可用 |

工程和通用组合节点还可涵盖：当前模型骨骼树、当前选中骨骼、按 UUID/路径选择、父/子骨骼、模型路径映射、动画片段选择/拖动/播放、当前预览帧、绑定失效诊断、从骨骼世界变换固定频率采样、缓存长度、轨迹清空、拖尾预览、控件模拟、子图输入输出、脚本模块引用、帧间平滑、状态机、插值缓动、累计时间、滤波、定时触发、防抖/节流、列表筛选/映射/折叠。组合节点使用已验证原语，以子图发布时可展开阅读。项目 UUID 属于编辑器，Lua 导出解析为经验证的运行时部件路径。

## 4. for 节点的落地模型

一个 for 节点拥有循环体子图。用户通过「编辑循环体」进入，面包屑返回父图。父图只有前向执行线；循环体末端的继续迭代由 Lua 语法负责。循环体里的「开始」节点是唯一的体入口。循环变量为子图局部符号，只在体内数据线上可接。

| 节点 | 父图输入 | 父图输出 | 循环体入口数据 | 生成 |
|---|---|---|---|---|
| 数值 for | 执行、起点、终点、步长可省略 | 完成执行 | index:number | `for i = start, limit[, step] do … end` |
| 顺序遍历 | 执行、表 | 完成执行 | index:number、value | `for i, v in ipairs(source) do … end` |
| 键值遍历 | 执行、表 | 完成执行 | key、value | `for k, v in pairs(source) do … end` |
| 自定义迭代器 | 执行、Lua 表达式列表或 iterator/state/initial | 完成执行 | 1..n 个具名值 | `for a, b, … in exprList do … end` |
| break | 循环体内执行触发 | 终止当前分支 | 无 | 原生 `break`，命中最近的循环，完成口继续 |
| return | 函数/事件块内执行和返回列表 | 终止当前函数/脚本 | 无 | 原生 `return`；所在循环的完成口不执行 |

### 4.1 核心数据与验证

```ts
type NumericForIR = {
  kind: "NumericFor"
  index: LocalSymbol
  initial: Expr
  limit: Expr
  step?: Expr
  body: Block
}

type GenericForIR = {
  kind: "GenericFor"
  bindings: LocalSymbol[]
  iteratorExpressions: ExprList
  body: Block
}
```

- 数值循环包含终点。缺省步长为 1，负数步长支持倒序，初始方向和步长不匹配时零次迭代。起点、终点、步长进入循环前按原顺序各求值一次。新建图的常量 0 步长报错。导入含 0 步长的 Lua 保留原语义并提示风险，动态零步长也不悄悄修正或插入守卫。具体数值边界以目标 LuaJ 实测。
- 通用 for 的表达式列表只在进入时求值，依 Lua 多返回调整构造 iterator、state、initial 三项。每轮调用 iterator(state, control)，返回首值为 nil 时停止，false 仍是有效首值。已解析的函数调用尾位多返回不得加括号意外收窄为单值。导入用户定义的同名 `pairs/ipairs` 时，保留原符号绑定和调用表达式。
- `pairs` 的键顺序不承诺，`ipairs` 的停止行为以目标运行时实现和元方法规则为准。需要排序时在循环前显式生成排序后的数据；禁止为了显示稳定而重排 Lua 遍历结果。
- Graph 校验阻止非法执行回边、跨体直连和循环变量出体引用。循环体可引用已绑定的外层符号。累加结果用循环外的局部变量或表，避免零次迭代时读取不存在的值。完成口在自然退出及 break 后最多执行一次。节点禁止为结构化体编辑自动加一层 Lua 函数；真实函数节点开启新的 break 搜索边界。
- Lua 5.2 的 continue 不做首版节点。用条件跳过本轮余下语句。现有 `goto`/标签或捕获关系不能安全重建时，保留最小语义闭合代码块和诊断。

### 4.2 Graph → IR → Lua

1. 在父块定位 for 节点，将接入的起点、终点、步长或表达式列表依顺序写入 IR。
2. 建立循环体词法作用域和循环符号表，解析子图入口与嵌套块。对子图入口数据口关联循环局部符号，`break` 检查最近循环且不跨函数。
3. 生成 Lua 时直接输出数值或通用 for。若上游调用须物化，按作用域、求值顺序及返回槽生成局部绑定；通用表达式列表尾位保留多返回。
4. 正常退出和 break 都汇合到 for 后面的父块语句，return/错误沿 Lua 语义传播。循环安全限额仅用于编辑器演示，导出的 Lua 仍受 OMM 自身指令预算。
5. AST 导入遇到数值/通用 for 时还原块和循环符号；仅在迭代器身份和签名可证明时把 `pairs/ipairs` 专化成便捷节点。侧车清单保存稳定 ID、布局、源范围、体块关系与源哈希；脱离清单从原生 Lua 恢复结构，未知字段和不透明片段保留原文。

### 4.3 例子与验收

```lua
local total = 0
for i = 5, 1, -1 do
    if i == 2 then
        break
    end
    total = total + i
end
print(total) -- 12
```

```lua
for key, value in pairs(settings) do
    print(key, value)
end
```

| 用例 | 业务断言 |
|---|---|
| 正序、倒序、缺省步长、首尾相同、方向不匹配 | 次数及顺序从运行时日志核对，完成口执行一次 |
| 边界表达式调用、通用 iterator factory | 参数求值顺序和次数保持；尾位三返回构造正确 |
| 自定义 iterator 首值 false / nil、多个变量 | false 继续，nil 停止；后续返回以 Lua 规则补 nil |
| 数组空洞、无序键、重绑的 pairs、迭代元方法 | 保留目标 LuaJ 的实际行为 |
| 双层循环 break、函数内非法 break、函数 return | 内层 break 不退出外层；非法连接有诊断；return 不触发完成口 |
| 同名嵌套局部、闭包捕获、体外引用 | 符号 ID 各自正确；体外非法接线被拒绝 |
| Lua → 图 → Lua、图 → Lua → 图 | 可结构化语句按 AST/运行语义对照；有侧车时恢复 ID，未知块保留原文 |
| 项目树遍历 | 对小型模型的只读骨骼快照运行图模拟，按稳定列表核对项数和顺序；真实 OMM 路径另验 |

### 4.4 Penpot 评审与代码落点

Penpot 文件 `OMM_BB_Plugin`（文件 ID `fa83bdeb-7bcf-80fa-8008-fea99e8cd53b`）的主工作区工具栏提供「For 循环」入口。下列页面各有一个画板，展示互相关联的静态状态。

| Penpot 页面 | 验收焦点 | 页面 ID |
|---|---|---|
| For 循环 · 数值节点与完成口 | 起点/终点/步长、独立完成口、生成 Lua 和结果 12 | `038496b5-4fc8-8059-8008-feb9fa08f87b` |
| For 循环 · 循环体与 break | 局部 i、外部累加符号、条件 break 和下一轮 | `038496b5-4fc8-8059-8008-feba01c0cef7` |
| For 循环 · pairs 与迭代器 | pairs 与通用迭代器输入、Lua 预览 | `038496b5-4fc8-8059-8008-feba09e54e8d` |
| For 循环 · 键值循环体 | 局部 key/value 接入输出，体末端进入下一轮 | `038496b5-4fc8-8059-8008-feba3fda4845` |

P2 在 `src/workflow/schema.ts` 定义循环块及端口，在 `src/workflow/validate.ts` 实现可见性、作用域和非法连线校验，在画布中提供循环体入口、返回面包屑及完成口。P3 在 `src/lua/ast/lower.ts`、`src/lua/ir/graph.ts` 和 `src/lua/generator/emit.ts` 实现两类 for 的导入、转换和生成，在 `src/lua/roundtrip.ts` 验证 ID 与源码恢复。先覆盖数值 for 和 break，再用同一块模型接入 ipairs、pairs 和显式迭代器。

## 5. 源码白名单候选索引

只读扫描上述参考源码中的七个 API/模型目录，共提取 84 个文件、1624 个文件内去重的普通白名单方法名。行号指向 Java 声明。别名与覆盖可出现在不同文件，数量用于盘点而非承诺同等数量的独立节点。

「注册」表示文件同名类在 FiguraAPIManager 有显式类型登记；「待追踪」表示需要核对对象来源、扩展入口、继承和实际 JAR。两个状态都须核对 Lua 访问形式、可见性和角色。元方法以运算、字段或动态调用节点承载。索引只提取 public 方法声明，字段、接口行为、动态事件和标准库通过前几节另行追踪。

- **Animation**（注册，org/figuramc/figura/animation/Animation.java）
  - 方法 `setKeyframeBoundary`:88、`sample`:115、`isPlaying`:324、`isPaused`:330、`isStopped`:336、`isHolding`:342、`play`:348、`pause`:367、`stop`:375、`restart`:384
  - 方法 `setPlaying`:402、`playing`:407、`getTime`:413、`setTime`:426、`time`:434、`getPlayState`:440、`newCode`:453、`code`:459、`getBlend`:465、`setBlend`:478
  - 方法 `blend`:484、`getOffset`:490、`setOffset`:503、`offset`:509、`getStartDelay`:515、`setStartDelay`:528、`startDelay`:534、`getLoopDelay`:540、`setLoopDelay`:553、`loopDelay`:559
  - 方法 `getLength`:565、`setLength`:578、`length`:584、`setOverride`:597、`override`:603、`getOverrideRot`:609、`getOverridePos`:615、`getOverrideScale`:621、`setOverrideRot`:634、`overrideRot`:640
  - 方法 `setOverridePos`:653、`overridePos`:659、`setOverrideScale`:672、`overrideScale`:678、`getLoop`:685、`setLoop`:698、`loop`:708、`getPriority`:714、`setPriority`:727、`priority`:733
  - 方法 `getSpeed`:739、`setSpeed`:752、`speed`:764、`getName`:770、`evalMolang`:788、`getMolangVar`:802、`setMolangVar`:821、`setMolangVars`:837
  - 元方法 `__index`:775
- **Action**（注册，org/figuramc/figura/lua/api/action_wheel/Action.java）
  - 方法 `getControlsPage`:150、`setControlsPage`:163、`controlsPage`:169、`controls_page`:174、`getYsmAction`:180、`setYsmAction`:193、`ysmAction`:199、`ysm_action`:204、`getTitle`:214、`setTitle`:233
  - 方法 `title`:240、`getColor`:246、`setColor`:265、`color`:271、`getHoverColor`:277、`setHoverColor`:296、`hoverColor`:302、`setItem`:321、`item`:327、`setHoverItem`:346
  - 方法 `hoverItem`:352、`setTexture`:379、`texture`:385、`setHoverTexture`:412、`hoverTexture`:418、`setOnLeftClick`:435、`onLeftClick`:441、`setOnRightClick`:454、`onRightClick`:460、`setOnToggle`:473
  - 方法 `onToggle`:479、`setOnUntoggle`:492、`onUntoggle`:498、`setOnScroll`:511、`onScroll`:517、`getToggleTitle`:527、`setToggleTitle`:540、`toggleTitle`:546、`getToggleColor`:552、`setToggleColor`:571
  - 方法 `toggleColor`:577、`setToggleItem`:596、`toggleItem`:602、`setToggleTexture`:629、`toggleTexture`:635、`isToggled`:641、`setToggled`:654、`toggled`:660
  - 元方法 `__index`:669、`__newindex`:682
- **ActionWheelAPI**（注册，org/figuramc/figura/lua/api/action_wheel/ActionWheelAPI.java）
  - 方法 `execute`:58、`isEnabled`:67、`getSelected`:73、`getSelectedAction`:79、`newAction`:92、`newPage`:107、`setPage`:127、`getPage`:163、`getCurrentPage`:169
  - 元方法 `__index`:195、`__newindex`:206
- **Page**（注册，org/figuramc/figura/lua/api/action_wheel/Page.java）
  - 方法 `shouldKeepSlots`:96、`setKeepSlots`:107、`getTitle`:114、`newAction`:129、`getAction`:146、`setAction`:161、`action`:183、`getSlotsShift`:189、`setSlotsShift`:202、`slotsShift`:208
  - 方法 `getActions`:222
  - 元方法 `__index`:236、`__newindex`:241
- **AnimationAPI**（注册，org/figuramc/figura/lua/api/AnimationAPI.java）
  - 方法 `getAnimations`:53、`getPlaying`:71、`stopAll`:81、`evalMolang`:98、`getMolangVar`:115、`setMolangVar`:130、`setMolangVars`:146、`getMolangVars`:171
  - 元方法 `__index`:88
- **AvatarAPI**（注册，org/figuramc/figura/lua/api/AvatarAPI.java）
  - 方法 `getNBT`:47、`store`:59、`getUUID`:66、`getCurrentInstructions`:72、`getColor`:78、`setColor`:105、`color`:126、`getBadges`:135、`getVersion`:142、`getAuthors`:148
  - 方法 `getName`:154、`getEntityName`:160、`getSize`:166、`hasTexture`:172、`hasScriptError`:178、`getPermissionLevel`:185、`getInitCount`:191、`getEntityInitCount`:197、`getMaxInitCount`:203、`getTickCount`:209
  - 方法 `getMaxTickCount`:215、`getRenderCount`:221、`getMaxRenderCount`:227、`getWorldTickCount`:233、`getMaxWorldTickCount`:239、`getWorldRenderCount`:245、`getMaxWorldRenderCount`:251、`getComplexity`:257、`getMaxComplexity`:263、`getRemainingParticles`:269
  - 方法 `getMaxParticles`:275、`getRemainingSounds`:281、`getMaxSounds`:287、`getVolume`:293、`getAnimationComplexity`:299、`getMaxAnimationComplexity`:305、`getAnimationCount`:311、`getMaxAnimationCount`:317、`getBuffersCount`:323、`getMaxBuffersCount`:329
  - 方法 `getMaxTextureSize`:335、`getMaxBufferSize`:341、`canEditVanillaModel`:347、`canEditNameplate`:353、`canRenderOffscreen`:359、`canUseCustomSounds`:365、`canHaveCustomSkull`:371
- **ClientAPI**（注册，org/figuramc/figura/lua/api/ClientAPI.java）
  - 方法 `getFPS`:94、`getFPSString`:103、`isPaused`:130、`getVersion`:136、`getVersionName`:142、`isSnapshot`:148、`getClientBrand`:154、`getServerBrand`:160、`getChunkStatistics`:169、`getEntityStatistics`:175
  - 方法 `getSoundStatistics`:181、`getEntityCount`:187、`getParticleCount`:196、`getCurrentEffect`:202、`getJavaVersion`:211、`getUsedMemory`:217、`getMaxMemory`:223、`getAllocatedMemory`:229、`isWindowFocused`:235、`isHudEnabled`:241
  - 方法 `isDebugOverlayEnabled`:247、`getWindowSize`:253、`getFOV`:260、`getSystemTime`:266、`getMousePos`:272、`getScaledWindowSize`:279、`getGuiScale`:286、`getCameraPos`:292、`getCameraRot`:299、`getCameraDir`:318
  - 方法 `getTextWidth`:330、`getTextHeight`:342、`getTextDimensions`:360、`getActiveLang`:371、`isModLoaded`:383、`hasShaderPackMod`:393、`hasShaderPack`:399、`getShaderPackName`:405、`hasResource`:435、`getActiveResourcePacks`:446
  - 方法 `getFiguraVersion`:457、`compareVersions`:468、`generateUUID`:482、`intUUIDToString`:493、`uuidToIntArray`:509、`getViewer`:520、`getCameraEntity`:526、`isIntegratedServer`:532、`getServerData`:537、`getDate`:563
  - 方法 `getFrameTime`:596、`getActionbar`:602、`getTitle`:609、`getSubtitle`:616、`getScoreboard`:623、`listAtlases`:673、`getAtlas`:688、`getTabList`:699、`getTranslatedString`:734、`getRegistry`:761
  - 方法 `getEnum`:785
- **ConfigAPI**（注册，org/figuramc/figura/lua/api/ConfigAPI.java）
  - 方法 `getName`:252、`setName`:265、`name`:273、`save`:285、`load`:312
- **DataAPI**（注册，org/figuramc/figura/lua/api/data/DataAPI.java）
  - 方法 `createBuffer`:33
- **FiguraBuffer**（注册，org/figuramc/figura/lua/api/data/FiguraBuffer.java）
  - 方法 `read`:81、`readShort`:93、`readUShort`:105、`readInt`:117、`readLong`:129、`readFloat`:141、`readDouble`:148、`readShortLE`:155、`readUShortLE`:167、`readIntLE`:179
  - 方法 `readLongLE`:191、`readFloatLE`:203、`readDoubleLE`:210、`readString`:234、`readBase64`:263、`readByteArray`:283、`write`:297、`writeShort`:321、`writeUShort`:339、`writeInt`:357
  - 方法 `writeLong`:373、`writeFloat`:393、`writeDouble`:406、`writeShortLE`:419、`writeUShortLE`:437、`writeIntLE`:455、`writeLongLE`:471、`writeFloatLE`:491、`writeDoubleLE`:504、`writeString`:525
  - 方法 `writeBase64`:551、`writeByteArray`:569、`getLength`:584、`getPosition`:591、`setPosition`:604、`clear`:611、`available`:619、`getMaxCapacity`:626、`readFromStream`:645、`writeToStream`:669
  - 方法 `close`:682、`isClosed`:696
- **FiguraFuture**（注册，org/figuramc/figura/lua/api/data/FiguraFuture.java）
  - 方法 `isDone`:44、`getValue`:65、`getOrError`:76、`throwError`:85
- **FiguraInputStream**（注册，org/figuramc/figura/lua/api/data/FiguraInputStream.java）
  - 方法 `read`:37、`readAsync`:48、`skip`:80、`available`:87、`close`:98、`mark`:112、`reset`:119、`markSupported`:126、`isAsyncOnly`:132、`transferTo`:146
- **FiguraOutputStream**（注册，org/figuramc/figura/lua/api/data/FiguraOutputStream.java）
  - 方法 `write`:36、`flush`:47、`close`:54
- **ResourcesAPI**（注册，org/figuramc/figura/lua/api/data/ResourcesAPI.java）
  - 方法 `get`:36、`getPaths`:55
  - 元方法 `__index`:60
- **EntityAPI**（注册，org/figuramc/figura/lua/api/entity/EntityAPI.java）
  - 方法 `isLoaded`:102、`getPos`:117、`getRot`:134、`getUUID`:142、`getType`:148、`getVelocity`:155、`getLookDir`:162、`getFrozenTicks`:169、`getMaxAir`:176、`getDimensionName`:183
  - 方法 `getPose`:190、`getVehicle`:197、`isOnGround`:204、`getEyeHeight`:211、`getBoundingBox`:218、`getName`:226、`isWet`:233、`isInWater`:240、`isUnderwater`:247、`isInLava`:254
  - 方法 `isInRain`:261、`hasAvatar`:269、`isSprinting`:276、`getEyeY`:283、`isGlowing`:290、`isInvisible`:297、`isSilent`:304、`isSneaking`:311、`isCrouching`:318、`isMoving`:334
  - 方法 `isFalling`:343、`getItem`:356、`getNbt`:376、`isOnFire`:385、`isAlive`:392、`getPermissionLevel`:399、`getPassengers`:418、`getControllingPassenger`:429、`getControlledVehicle`:436、`hasContainer`:443
  - 方法 `hasInventory`:450、`getTargetedBlock`:470、`getTargetedEntity`:489、`getNearestEntity`:523、`getVariable`:561、`isLiving`:571、`isPlayer`:577
  - 元方法 `__eq`:587、`__tostring`:597
- **LivingEntityAPI**（注册，org/figuramc/figura/lua/api/entity/LivingEntityAPI.java）
  - 方法 `getBodyYaw`:37、`getHeldItem`:54、`getActiveItem`:61、`getActiveItemTime`:68、`getHealth`:75、`getMaxHealth`:82、`getArmor`:89、`getDeathTime`:96、`getArrowCount`:103、`getStingerCount`:110
  - 方法 `isLeftHanded`:117、`isUsingItem`:124、`getActiveHand`:131、`isClimbing`:138、`getSwingTime`:145、`isSwingingArm`:152、`getSwingArm`:159、`getSwingDuration`:166、`getAbsorptionAmount`:173、`isSensitiveToWater`:180
  - 方法 `getEntityCategory`:187、`isGliding`:205、`isBlocking`:212、`isVisuallySwimming`:219、`riptideSpinning`:226
- **NullEntity**（注册，org/figuramc/figura/lua/api/entity/NullEntity.java）
  - 方法 `isLoaded`:19
  - 元方法 `__index`:24
- **PlayerAPI**（注册，org/figuramc/figura/lua/api/entity/PlayerAPI.java）
  - 方法 `getFood`:57、`getSaturation`:64、`getExhaustion`:71、`getExperienceProgress`:78、`getExperienceLevel`:85、`getModelType`:92、`getGamemode`:99、`hasCape`:110、`hasSkin`:117、`isSkinLayerVisible`:130
  - 方法 `isFishing`:143、`getChargedAttackDelay`:150、`getShoulderEntity`:165、`getTeamInfo`:179、`getCooldownPercent`:214
- **ViewerAPI**（注册，org/figuramc/figura/lua/api/entity/ViewerAPI.java）
  - 方法 `getAttackCharge`:35、`isJumping`:42、`isFlying`:49、`getReachDistance`:56、`getAir`:63、`getStatusEffects`:70
- **EventsAPI**（注册，org/figuramc/figura/lua/api/event/EventsAPI.java）
  - 方法 `getEvents`:140
  - 元方法 `__index`:149、`__newindex`:155
- **LuaEvent**（注册，org/figuramc/figura/lua/api/event/LuaEvent.java）
  - 方法 `register`:99、`clear`:110、`remove`:131、`getRegisteredCount`:160
  - 元方法 `__len`:170
- **FileAPI**（注册，org/figuramc/figura/lua/api/FileAPI.java）
  - 方法 `isPathAllowed`:62、`allowed`:77、`exists`:90、`isFile`:105、`isDirectory`:120、`openReadStream`:135、`openWriteStream`:155、`readString`:178、`writeString`:205、`mkdir`:230
  - 方法 `mkdirs`:248、`delete`:266、`list`:284
- **HostAPI**（注册，org/figuramc/figura/lua/api/HostAPI.java）
  - 方法 `isHost`:79、`isCursorUnlocked`:85、`setUnlockCursor`:96、`setTitleTimes`:116、`titleTimes`:124、`clearTitle`:130、`setTitle`:145、`title`:152、`setSubtitle`:165、`subtitle`:172
  - 方法 `setActionbar`:191、`actionbar`:198、`sendChatMessage`:210、`sendChatCommand`:225、`appendChatHistory`:240、`getChatMessage`:254、`setChatMessage`:293、`swingArm`:325、`getSlot`:345、`setSlot`:364
  - 方法 `setBadge`:380、`badge`:395、`getChatColor`:401、`setChatColor`:420、`chatColor`:426、`getChatText`:432、`setChatText`:448、`chatText`:455、`getScreen`:461、`getScreenSlotCount`:469
  - 方法 `getScreenSlot`:480、`isChatOpen`:493、`isContainerOpen`:499、`screenshot`:510、`isAvatarUploaded`:540、`getStatusEffects`:546、`getClipboard`:568、`setClipboard`:580、`clipboard`:586、`getAttackCharge`:592
  - 方法 `isJumping`:601、`isFlying`:610、`getReachDistance`:619、`getAir`:625、`getPickBlock`:634、`getPickEntity`:640、`isChatVerified`:646、`writeToLog`:660、`warnToLog`:672
  - 元方法 `__newindex`:684
- **FiguraJsonArray**（注册，org/figuramc/figura/lua/api/json/FiguraJsonArray.java）
  - 方法 `get`:28、`size`:37、`contains`:46、`add`:55、`insert`:68、`set`:81、`removeAt`:95、`remove`:108、`indexOf`:121、`lastIndexOf`:134
  - 方法 `clear`:140
  - 元方法 `__index`:145、`__newindex`:154、`__len`:164、`__ipairs`:169、`__pairs`:176
- **FiguraJsonBuilder**（注册，org/figuramc/figura/lua/api/json/FiguraJsonBuilder.java）
  - 方法 `build`:22
  - 元方法 `__index`:31、`__newindex`:41
- **FiguraJsonObject**（注册，org/figuramc/figura/lua/api/json/FiguraJsonObject.java）
  - 方法 `size`:27、`get`:36、`containsKey`:45、`put`:58、`remove`:69、`clear`:75、`containsValue`:84
  - 元方法 `__index`:99、`__newindex`:106、`__pairs`:113、`__ipairs`:120
- **FiguraJsonSerializer**（注册，org/figuramc/figura/lua/api/json/FiguraJsonSerializer.java）
  - 方法 `serialize`:29、`deserialize`:46
- **JsonAPI**（注册，org/figuramc/figura/lua/api/json/JsonAPI.java）
  - 方法 `newBuilder`:24、`newArray`:35、`newObject`:46、`isSerializable`:59
- **FiguraKeybind**（注册，org/figuramc/figura/lua/api/keybind/FiguraKeybind.java）
  - 方法 `setOnPress`:133、`onPress`:139、`setOnRelease`:152、`onRelease`:158、`setKey`:171、`key`:177、`isDefault`:183、`getKey`:189、`getKeyName`:195、`getName`:201
  - 方法 `getID`:207、`isPressed`:213、`isEnabled`:219、`setEnabled`:232、`enabled`:238、`isGuiEnabled`:244、`setGUI`:257、`gui`:263
  - 元方法 `__index`:268、`__newindex`:278
- **KeybindAPI**（注册，org/figuramc/figura/lua/api/keybind/KeybindAPI.java）
  - 方法 `newKeybind`:51、`of`:59、`fromVanilla`:71、`getVanillaKey`:87、`getKeybinds`:94
- **MatricesAPI**（注册，org/figuramc/figura/lua/api/math/MatricesAPI.java）
  - 方法 `mat2`:36、`mat3`:58、`mat4`:81、`compose4`:102、`composeEulerXYZ`:136、`sample4`:166、`rotation2`:250、`rotation3`:270、`xRotation3`:285、`yRotation3`:299
  - 方法 `zRotation3`:313、`rotation4`:333、`xRotation4`:348、`yRotation4`:362、`zRotation4`:376、`scale2`:397、`scale3`:418、`scale4`:439、`translate3`:461、`translate4`:481
- **VectorsAPI**（注册，org/figuramc/figura/lua/api/math/VectorsAPI.java）
  - 方法 `vec`:47、`vec2`:77、`vec3`:89、`vec4`:101、`rgbToInt`:121、`intToRGB`:134、`hexToRGB`:146、`hsvToRGB`:164、`rgbToHSV`:183、`rgbToHex`:202
  - 方法 `rotateAroundAxis`:231、`toCameraSpace`:255、`worldToScreenSpace`:273、`angleToDir`:282
- **EntityNameplateCustomization**（注册，org/figuramc/figura/lua/api/nameplate/EntityNameplateCustomization.java）
  - 方法 `getPivot`:30、`setPivot`:49、`pivot`:55、`getPos`:61、`setPos`:80、`pos`:86、`getScale`:92、`setScale`:111、`scale`:117、`getBackgroundColor`:123
  - 方法 `setBackgroundColor`:142、`backgroundColor`:149、`setOutlineColor`:168、`outlineColor`:174、`getLight`:180、`setLight`:198、`light`:210、`isVisible`:216、`setVisible`:229、`visible`:235
  - 方法 `hasOutline`:241、`setOutline`:254、`outline`:260、`hasShadow`:266、`setShadow`:279、`shadow`:285
- **NameplateAPI**（注册，org/figuramc/figura/lua/api/nameplate/NameplateAPI.java）
  - 元方法 `__index`:37
- **NameplateCustomization**（注册，org/figuramc/figura/lua/api/nameplate/NameplateCustomization.java）
  - 方法 `getText`:38、`setText`:50
- **NameplateCustomizationGroup**（注册，org/figuramc/figura/lua/api/nameplate/NameplateCustomizationGroup.java）
  - 方法 `setText`:32
- **HttpRequestsAPI**（注册，org/figuramc/figura/lua/api/net/HttpRequestsAPI.java）
  - 方法 `request`:48、`getData`:84、`getResponseCode`:95、`getHeaders`:106/248、`uri`:143、`method`:157、`body`:178、`header`:197、`getUri`:213、`getMethod`:224
  - 方法 `getBody`:236、`send`:276
- **NetworkingAPI**（注册，org/figuramc/figura/lua/api/net/NetworkingAPI.java）
  - 方法 `isNetworkingAllowed`:71、`isLinkAllowed`:84
  - 元方法 `__index`:221
- **LuaParticle**（注册，org/figuramc/figura/lua/api/particle/LuaParticle.java）
  - 方法 `spawn`:46、`setQuad`:93、`setQuads`:100、`setQuadsTransform`:107、`getQuad`:114、`setSpriteSheet`:119、`setLayers`:126、`getLayerCount`:132、`setRenderMode`:137、`getRenderMode`:143
  - 方法 `setAnchorTrail`:148、`isAnchorTrail`:154、`setRibbon`:159、`getRibbon`:165、`getRenderError`:170、`setAcceleration`:175、`getAcceleration`:182、`setMotion`:187、`getMotionMode`:193、`getMotionError`:198
  - 方法 `setTickCallback`:203、`setFrameCallback`:209、`getCallbackError`:215、`setRotation`:220、`getRotation`:226、`setAngularVelocity`:231、`getAngularVelocity`:237、`setBlendMode`:242、`getBlendMode`:248、`setFrame`:253
  - 方法 `getFrame`:259、`setPaused`:264、`isPaused`:270、`setEmissive`:275、`isEmissive`:281、`setDynamicLight`:286、`isDynamicLight`:292、`setLightLevel`:297、`getLightLevel`:306、`setLightRadius`:311
  - 方法 `getLightRadius`:317、`setLightInterval`:322、`getLightInterval`:331、`remove`:337、`isAlive`:344、`getPos`:350、`setPos`:369、`pos`:382、`getVelocity`:388、`setVelocity`:407
  - 方法 `velocity`:414、`getColor`:420、`setColor`:446、`color`:459、`getLifetime`:465、`setLifetime`:477、`lifetime`:483、`getPower`:489、`setPower`:501、`power`:511
  - 方法 `getScale`:517、`getSize`:522、`setScale`:534、`scale`:548、`setSize`:553、`size`:558、`getGravity`:564、`setGravity`:576、`gravity`:593、`hasPhysics`:599
  - 方法 `setPhysics`:611、`physics`:617
- **ParticleAPI**（注册，org/figuramc/figura/lua/api/particle/ParticleAPI.java）
  - 方法 `newCustomParticle`:46、`newTexturedParticle`:76、`newParticle`:291、`removeParticles`:306、`isPresent`:319
  - 元方法 `__index`:332
- **PingAPI**（注册，org/figuramc/figura/lua/api/ping/PingAPI.java）
  - 元方法 `__index`:35、`__newindex`:40
- **RaycastAPI**（注册，org/figuramc/figura/lua/api/RaycastAPI.java）
  - 方法 `block`:74、`entity`:131、`aabb`:183
- **RendererAPI**（注册，org/figuramc/figura/lua/api/RendererAPI.java）
  - 方法 `shouldRenderFire`:77、`setRenderFire`:88、`shouldRenderVehicle`:95、`setRenderVehicle`:106、`shouldRenderCrosshair`:113、`setRenderCrosshair`:124、`shouldForcePaperdoll`:131、`setForcePaperdoll`:142、`shouldRenderHUD`:149、`setRenderHUD`:160
  - 方法 `isUpsideDown`:167、`setUpsideDown`:173、`upsideDown`:179、`setShadowRadius`:195、`shadowRadius`:201、`getShadowRadius`:207、`isFirstPerson`:213、`isCameraBackwards`:219、`getCameraPos`:225、`setCameraPos`:244
  - 方法 `cameraPos`:250、`getCameraPivot`:256、`setCameraPivot`:275、`cameraPivot`:281、`getCameraOffsetPivot`:287、`setOffsetCameraPivot`:306、`offsetCameraPivot`:312、`getCameraRot`:318、`setCameraRot`:337、`cameraRot`:343
  - 方法 `getCameraOffsetRot`:349、`setOffsetCameraRot`:368、`offsetCameraRot`:374、`getCameraMatrix`:380、`setCameraMatrix`:393、`cameraMatrix`:399、`getCameraNormal`:405、`setCameraNormal`:411、`cameraNormal`:417、`setPostEffect`:430
  - 方法 `postEffect`:441、`getFOV`:447、`setFOV`:463、`fov`:469、`getCrosshairOffset`:475、`setCrosshairOffset`:493、`getOutlineColor`:500、`setOutlineColor`:519、`outlineColor`:525、`crosshairOffset`:530
  - 方法 `getPrimaryFireTexture`:536、`getSecondaryFireTexture`:542、`setPrimaryFireTexture`:555、`setSecondaryFireTexture`:577、`primaryFireTexture`:591、`secondaryFireTexture`:596、`setRenderLeftArm`:609、`renderLeftArm`:615、`getRenderLeftArm`:621、`setRenderRightArm`:634
  - 方法 `renderRightArm`:640、`getRenderRightArm`:646、`setEyeOffset`:665、`eyeOffset`:671、`getEyeOffset`:677、`setBlockOutlineColor`:699、`getBlockOutlineColor`:706、`blockOutlineColor`:711、`setRootRotationAllowed`:724、`rootRotationAllowed`:730
  - 方法 `getRootRotationAllowed`:736
  - 元方法 `__index`:741、`__newindex`:754
- **LuaSound**（注册，org/figuramc/figura/lua/api/sound/LuaSound.java）
  - 方法 `play`:100、`isPlaying`:216、`pause`:234、`stop`:243、`getPos`:253、`setPos`:271、`pos`:279、`getVolume`:285、`setVolume`:297、`volume`:317
  - 方法 `getAttenuation`:323、`setAttenuation`:335、`attenuation`:343、`getPitch`:349、`setPitch`:361、`pitch`:369、`isLooping`:375、`setLoop`:387、`loop`:395、`getSubtitle`:401
  - 方法 `setSubtitle`:413、`subtitle`:426
- **SoundAPI**（注册，org/figuramc/figura/lua/api/sound/SoundAPI.java）
  - 方法 `playSound`:67、`stopSound`:114、`newSound`:133、`isPresent`:161、`getCustomSounds`:175
  - 元方法 `__index`:189
- **TextureAPI**（注册，org/figuramc/figura/lua/api/TextureAPI.java）
  - 方法 `newTexture`:63、`read`:89、`copy`:121、`get`:133、`getTextures`:140、`fromVanilla`:153
  - 元方法 `__index`:195
- **TextureAtlasAPI**（注册，org/figuramc/figura/lua/api/TextureAtlasAPI.java）
  - 方法 `listSprites`:33、`getSpriteUV`:48、`getWidth`:56、`getHeight`:62
- **VanillaGroupPart**（注册，org/figuramc/figura/lua/api/vanilla_model/VanillaGroupPart.java）
  - 方法 `setVisible`:66、`setPos`:88、`setRot`:110、`setOffsetRot`:132、`setScale`:154、`setOffsetScale`:176
  - 元方法 `__index`:183
- **VanillaModelAPI**（注册，org/figuramc/figura/lua/api/vanilla_model/VanillaModelAPI.java）
  - 元方法 `__index`:322
- **VanillaModelPart**（注册，org/figuramc/figura/lua/api/vanilla_model/VanillaModelPart.java）
  - 方法 `getOriginVisible`:154、`getOriginRot`:160、`getOriginPos`:166、`getOriginScale`:172
- **VanillaPart**（注册，org/figuramc/figura/lua/api/vanilla_model/VanillaPart.java）
  - 方法 `getVisible`:43、`setVisible`:56、`visible`:62、`getPos`:68、`setPos`:87、`pos`:93、`getRot`:100、`setRot`:119、`rot`:125、`getOffsetRot`:132
  - 方法 `setOffsetRot`:151、`offsetRot`:157、`getScale`:163、`setScale`:182、`scale`:188、`getOffsetScale`:195、`setOffsetScale`:214、`offsetScale`:220
- **BiomeAPI**（注册，org/figuramc/figura/lua/api/world/BiomeAPI.java）
  - 方法 `getPos`:51、`setPos`:70、`pos`:77、`getTags`:83、`getTemperature`:100、`getPrecipitation`:106、`getSkyColor`:112、`getFoliageColor`:118、`getGrassColor`:124、`getFogColor`:131
  - 方法 `getWaterColor`:137、`getWaterFogColor`:143、`getDownfall`:149、`isHot`:155、`isCold`:161
  - 元方法 `__eq`:166、`__index`:171
- **BlockStateAPI**（注册，org/figuramc/figura/lua/api/world/BlockStateAPI.java）
  - 方法 `getID`:87、`getProperties`:93、`getPos`:99、`setPos`:118、`pos`:125、`isTranslucent`:131、`getOpacity`:137、`getMapColor`:143、`isSolidBlock`:149、`isFullCube`:155
  - 方法 `hasEmissiveLighting`:161、`getHardness`:167、`getComparatorOutput`:173、`hasBlockEntity`:179、`isOpaque`:185、`emitsRedstonePower`:191、`getLuminance`:197、`getFriction`:203、`getVelocityMultiplier`:209、`getJumpVelocityMultiplier`:215
  - 方法 `getBlastResistance`:221、`asItem`:227、`getTags`:233、`hasCollision`:250、`getCollisionShape`:256、`getOutlineShape`:262、`getSounds`:268、`getFluidTags`:285、`getEntityData`:294、`toStateString`:313
  - 方法 `getTextures`:322、`isAir`:346
  - 元方法 `__eq`:371、`__index`:376
- **ItemStackAPI**（注册，org/figuramc/figura/lua/api/world/ItemStackAPI.java）
  - 方法 `getID`:71、`getTag`:77、`getCount`:83、`getDamage`:89、`getPopTime`:95、`hasGlint`:101、`getTags`:107、`isBlockItem`:124、`isFood`:130、`getUseAction`:136
  - 方法 `getName`:142、`getMaxCount`:148、`getRarity`:154、`isEnchantable`:160、`getMaxDamage`:166、`isDamageable`:172、`isStackable`:178、`getRepairCost`:184、`getUseDuration`:190、`toStackString`:196
  - 方法 `isArmor`:208、`isTool`:214、`getEquipmentSlot`:220、`copy`:226、`getBlockstate`:232
  - 元方法 `__eq`:237、`__index`:257
- **WorldAPI**（注册，org/figuramc/figura/lua/api/world/WorldAPI.java）
  - 方法 `getBiome`:76、`getBlockState`:96、`isChunkLoaded`:119、`getBlocks`:149、`getMapData`:184、`getRedstonePower`:234、`getStrongRedstonePower`:256、`getTime`:275、`getTimeOfDay`:290、`getDayTime`:305
  - 方法 `getDay`:320、`getMoonPhase`:329、`getRainGradient`:344、`isThundering`:351、`getLightLevel`:369、`getSkyLightLevel`:393、`getBlockLightLevel`:416、`getHeight`:439、`isOpenSky`:471、`getDimension`:482
  - 方法 `getPlayers`:489、`getEntities`:510、`getEntity`:530、`avatarVars`:540、`newBlock`:567、`newItem`:596、`exists`:612、`getBuildHeight`:618、`getSpawnPoint`:625
- **FiguraMat2**（注册，org/figuramc/figura/math/matrix/FiguraMat2.java）
  - 方法 `copy`:49、`getColumn`:80、`getRow`:98、`set`:126、`multiply`:150、`rightMultiply`:175、`transpose`:198、`transposed`:213、`invert`:225、`inverted`:243
  - 方法 `det`:250、`reset`:262、`add`:275、`sub`:294、`scale`:330、`rotate`:342、`augmented`:362、`apply`:381、`applyDir`:393
  - 元方法 `__add`:400、`__sub`:404、`__mul`:408、`__eq`:419、`__len`:423、`__tostring`:427、`__index`:431、`__newindex`:450
- **FiguraMat3**（注册，org/figuramc/figura/math/matrix/FiguraMat3.java）
  - 方法 `copy`:81、`getColumn`:113、`getRow`:132、`set`:161、`multiply`:191、`rightMultiply`:227、`transpose`:261、`transposed`:278、`invert`:290、`inverted`:335
  - 方法 `det`:342、`reset`:354、`add`:368、`sub`:392、`scale`:438、`translate`:471、`rotateX`:483、`rotateY`:511、`rotateZ`:539、`rotate`:625
  - 方法 `deaugmented`:632、`augmented`:640、`apply`:665、`applyDir`:684
  - 元方法 `__add`:692、`__sub`:696、`__mul`:700、`__eq`:711、`__len`:715、`__tostring`:719、`__index`:723、`__newindex`:749
- **FiguraMat4**（注册，org/figuramc/figura/math/matrix/FiguraMat4.java）
  - 方法 `copy`:104、`getColumn`:135、`getRow`:155、`set`:185、`multiply`:223、`rightMultiply`:273、`transpose`:321、`transposed`:341、`invert`:353、`inverted`:422
  - 方法 `det`:429、`reset`:441、`add`:455、`sub`:486、`scale`:543、`translate`:587、`rotateX`:609、`rotateY`:640、`rotateZ`:671、`rotate`:764
  - 方法 `deaugmented`:772、`apply`:818、`applyDir`:837
  - 元方法 `__add`:845、`__sub`:849、`__mul`:853、`__eq`:864、`__len`:868、`__tostring`:872、`__index`:876、`__newindex`:911
- **FiguraVec2**（注册，org/figuramc/figura/math/vector/FiguraVec2.java）
  - 方法 `reset`:40、`set`:80、`add`:109、`sub`:138、`offset`:152、`mul`:183、`div`:212、`reduce`:241、`scale`:255、`unpack`:264
  - 方法 `transform`:280、`lengthSquared`:292、`copy`:304、`dot`:317、`normalize`:329、`normalized`:341、`clampLength`:355、`clamped`:369、`length`:376、`toRad`:388
  - 方法 `toDeg`:400、`floor`:406、`ceil`:412、`applyFunc`:424、`augmented`:441、`toString`:473
  - 元方法 `__add`:493、`__sub`:519、`__mul`:548、`__div`:573、`__mod`:596、`__eq`:615、`__unm`:625、`__len`:635、`__lt`:645、`__le`:655
  - 元方法 `__tostring`:665、`__index`:684、`__newindex`:727
- **FiguraVec3**（注册，org/figuramc/figura/math/vector/FiguraVec3.java）
  - 方法 `reset`:47、`set`:88、`add`:118、`sub`:148、`offset`:162、`mul`:195、`div`:225、`reduce`:255、`scale`:269、`unpack`:279
  - 方法 `transform`:295、`lengthSquared`:306、`copy`:318、`dot`:331、`normalize`:343、`normalized`:355、`clampLength`:369、`clamped`:383、`length`:390、`toRad`:402
  - 方法 `toDeg`:414、`floor`:420、`ceil`:426、`applyFunc`:438、`augmented`:456、`toString`:492、`cross`:506、`crossed`:522
  - 元方法 `__add`:567、`__sub`:593、`__mul`:622、`__div`:647、`__mod`:670、`__eq`:689、`__unm`:699、`__len`:709、`__lt`:719、`__le`:729
  - 元方法 `__tostring`:739、`__index`:758、`__newindex`:800
- **FiguraVec4**（注册，org/figuramc/figura/math/vector/FiguraVec4.java）
  - 方法 `reset`:45、`set`:87、`add`:122、`sub`:157、`offset`:175、`mul`:210、`div`:245、`reduce`:280、`scale`:298、`unpack`:309
  - 方法 `transform`:325、`lengthSquared`:337、`copy`:349、`dot`:362、`normalize`:374、`normalized`:386、`clampLength`:400、`clamped`:414、`length`:421、`toRad`:433
  - 方法 `toDeg`:445、`floor`:451、`ceil`:457、`applyFunc`:469、`toString`:513
  - 元方法 `__add`:533、`__sub`:559、`__mul`:588、`__div`:613、`__mod`:636、`__eq`:655、`__unm`:665、`__len`:675、`__lt`:685、`__le`:695
  - 元方法 `__tostring`:705、`__index`:724、`__newindex`:768
- **FiguraModelPart**（注册，org/figuramc/figura/model/FiguraModelPart.java）
  - 方法 `setShaderMaterial`:112、`setMaterialTime`:120、`setPreRender`:300、`setMidRender`:313、`setPostRender`:326、`getName`:333、`getParent`:339、`getChildren`:345、`isChildOf`:360、`getPos`:373
  - 方法 `setPos`:392、`pos`:399、`getAnimPos`:405、`getTruePos`:411、`getRot`:417、`setRot`:436、`rot`:443、`getOffsetRot`:449、`setOffsetRot`:468、`offsetRot`:475
  - 方法 `getAnimRot`:481、`getTrueRot`:487、`getScale`:493、`setScale`:512、`scale`:519、`getOffsetScale`:525、`setOffsetScale`:544、`offsetScale`:551、`getAnimScale`:557、`getTrueScale`:563
  - 方法 `getPivot`:569、`setPivot`:588、`pivot`:595、`getOffsetPivot`:601、`setOffsetPivot`:620、`offsetPivot`:627、`getTruePivot`:633、`getPositionMatrix`:639、`getPositionMatrixRaw`:646、`getNormalMatrix`:652
  - 方法 `getNormalMatrixRaw`:659、`setMatrix`:672、`matrix`:678、`getVisible`:684、`setVisible`:700、`visible`:706、`getPrimaryRenderType`:712、`getSecondaryRenderType`:719、`setPrimaryRenderType`:733、`setSecondaryRenderType`:751
  - 方法 `primaryRenderType`:761、`secondaryRenderType`:766、`getPrimaryTexture`:772、`getSecondaryTexture`:778、`getPrimaryDefinedTextures`:799、`getSecondaryDefinedTextures`:819、`setPrimaryTexture`:853、`setSecondaryTexture`:888、`primaryTexture`:917、`secondaryTexture`:922
  - 方法 `getTextures`:928、`partToWorldMatrix`:943、`getTextureSize`:949、`setUV`:974、`uv`:982、`getUV`:988、`setUVPixels`:1006、`uvPixels`:1025、`getUVPixels`:1031、`setUVMatrix`:1050
  - 方法 `uvMatrix`:1056、`getUVMatrix`:1062、`setColor`:1080、`color`:1088、`getColor`:1094、`setPrimaryColor`:1112、`primaryColor`:1118、`getPrimaryColor`:1124、`setSecondaryColor`:1142、`secondaryColor`:1148
  - 方法 `getSecondaryColor`:1154、`setOpacity`:1166、`opacity`:1172、`getOpacity`:1178、`setLight`:1196、`light`:1208、`getLight`:1214、`setOverlay`:1233、`overlay`:1245、`getOverlay`:1251
  - 方法 `setParentType`:1264、`parentType`:1277、`getParentType`:1283、`getType`:1289、`overrideVanillaRot`:1295、`overrideVanillaPos`:1301、`overrideVanillaScale`:1307、`newText`:1318、`newItem`:1331、`newBlock`:1344
  - 方法 `newSprite`:1357、`newEntity`:1370、`addTask`:1378、`getTask`:1394、`removeTask`:1409、`remove`:1423、`getVertices`:1438、`getAllVertices`:1451、`moveTo`:1468、`addChild`:1494
  - 方法 `removeChild`:1524、`copy`:1545、`newPart`:1577、`setInverseBindMatrix`:1601
  - 元方法 `__index`:1625、`__newindex`:1648
- **FiguraTexture**（注册，org/figuramc/figura/model/rendering/texture/FiguraTexture.java）
  - 方法 `getName`:372、`getPath`:378、`getDimensions`:384、`getPixel`:395、`setPixel`:421、`pixel`:432、`fill`:453、`update`:465、`restore`:472、`save`:482
  - 方法 `applyFunc`:498、`applyMatrix`:518
  - 元方法 `__index`:538
- **Vertex**（注册，org/figuramc/figura/model/rendering/Vertex.java）
  - 方法 `getPos`:42、`setPos`:61、`pos`:70、`getUV`:76、`setUV`:95、`uv`:103、`getNormal`:109、`setNormal`:128、`normal`:141
- **BlockTask**（注册，org/figuramc/figura/model/rendertasks/BlockTask.java）
  - 方法 `setBlock`:117、`block`:136
- **EntityTask**（注册，org/figuramc/figura/model/rendertasks/EntityTask.java）
  - 方法 `asEntity`:94、`setNbt`:114、`updateWalkingDistance`:150、`setHeadRotation`:166
- **ItemTask**（注册，org/figuramc/figura/model/rendertasks/ItemTask.java）
  - 方法 `setItem`:85、`item`:94、`getDisplayMode`:100、`setDisplayMode`:113、`displayMode`:124
- **RenderTask**（注册，org/figuramc/figura/model/rendertasks/RenderTask.java）
  - 方法 `remove`:60、`getName`:67、`isVisible`:73、`setVisible`:86、`visible`:92、`getLight`:98、`setLight`:117、`light`:129、`getOverlay`:135、`setOverlay`:154
  - 方法 `overlay`:166、`getPos`:172、`setPos`:191、`pos`:198、`getRot`:204、`setRot`:223、`rot`:230、`getScale`:236、`setScale`:255、`scale`:262
  - 方法 `getPositionMatrix`:268、`getPositionMatrixRaw`:275、`getNormalMatrix`:281、`getNormalMatrixRaw`:288、`setMatrix`:301、`matrix`:307
- **SpriteTask**（注册，org/figuramc/figura/model/rendertasks/SpriteTask.java）
  - 方法 `getTexture`:107、`setTexture`:138、`texture`:175、`getDimensions`:181、`setDimensions`:200、`dimensions`:211、`getSize`:217、`setSize`:236、`size`:245、`getRegion`:251
  - 方法 `setRegion`:270、`region`:279、`getUV`:285、`setUV`:304、`uv`:313、`getUVPixels`:319、`setUVPixels`:339、`uvPixels`:351、`getColor`:357、`setColor`:380
  - 方法 `color`:391、`getRenderType`:397、`setRenderType`:410、`renderType`:420、`getVertices`:426
- **TextTask**（注册，org/figuramc/figura/model/rendertasks/TextTask.java）
  - 方法 `getText`:132、`setText`:145、`text`:153、`getAlignment`:159、`setAlignment`:172、`alignment`:182、`hasShadow`:188、`setShadow`:201、`shadow`:207、`hasOutline`:213
  - 方法 `setOutline`:226、`outline`:232、`getOutlineColor`:238、`setOutlineColor`:257、`outlineColor`:264、`getWidth`:270、`setWidth`:283、`width`:290、`hasWrap`:296、`setWrap`:309
  - 方法 `wrap`:316、`isSeeThrough`:322、`setSeeThrough`:335、`seeThrough`:341、`hasBackground`:347、`setBackground`:360、`background`:366、`getBackgroundColor`:372、`setBackgroundColor`:391、`backgroundColor`:398
  - 方法 `getOpacity`:404、`setOpacity`:410、`opacity`:416
- **AvatarControlDefinition**（注册，top/aihmc/omnimorph/avatar/control/AvatarControlDefinition.java）
  - 方法 `getId`:169、`getType`:175、`getTitle`:181、`setTitle`:197、`set_title`:205、`title`:210、`getDescription`:216、`setDescription`:229、`set_description`:237、`description`:242
  - 方法 `getPage`:248、`setPage`:261、`set_page`:268、`page`:273、`getCategory`:279、`setCategory`:292、`set_category`:299、`category`:304、`getBinding`:310、`setBinding`:323
  - 方法 `set_binding`:330、`binding`:335、`isPersistent`:341、`setPersistent`:354、`set_persistent`:361、`persistent`:366、`getTargetPage`:372、`setTargetPage`:385、`set_target_page`:392、`targetPage`:397
  - 方法 `target_page`:402、`getDefault`:408、`setDefault`:421、`set_default`:432、`defaultValue`:437、`getValue`:443、`setValue`:456、`set_value`:476、`value`:481、`getMin`:487
  - 方法 `getMax`:493、`getStep`:499、`setMin`:505、`set_min`:514、`min`:519、`setMax`:525、`set_max`:532、`max`:537、`setStep`:543、`set_step`:551
  - 方法 `step`:556、`setRange`:569、`set_range`:586、`range`:591、`getOptions`:597、`addOption`:610、`getOptionCommands`:619、`get_option_commands`:624、`addOptionCommand`:637、`add_option_command`:646
  - 方法 `optionCommand`:651、`option_command`:656、`setOptions`:669、`set_options`:683、`options`:688、`add_option`:693、`option`:698、`removeOption`:704、`remove_option`:711、`clearOptions`:717
  - 方法 `clear_options`:724、`setOnChange`:737、`set_on_change`:743、`onChange`:748、`on_change`:753、`setOnPress`:766、`set_on_press`:772、`onPress`:777、`on_press`:782
- **AvatarControlsAPI**（注册，top/aihmc/omnimorph/lua/api/avatar_controls/AvatarControlsAPI.java）
  - 方法 `getControls`:34、`get_controls`:39、`getControl`:51、`get_control`:56、`getTypes`:62、`get_types`:70、`newControl`:83、`new_control`:91、`of`:96、`newToggle`:102
  - 方法 `new_toggle`:107、`newCheckbox`:112、`new_checkbox`:117、`newSwitch`:122、`new_switch`:127、`newSlider`:133、`new_slider`:138、`newRange`:143、`new_range`:148、`newEnum`:154
  - 方法 `new_enum`:159、`newDropdown`:164、`new_dropdown`:169、`newSelect`:174、`new_select`:179、`newRadio`:184、`new_radio`:189、`newColor`:195、`new_color`:200、`newText`:206
  - 方法 `new_text`:211、`newInput`:216、`new_input`:221、`newNumber`:227、`new_number`:232、`newKeybind`:238、`new_keybind`:243、`newButton`:249、`new_button`:254、`newAction`:259
  - 方法 `new_action`:264、`newPage`:270、`new_page`:275、`newTab`:280、`new_tab`:285、`newLabel`:291、`new_label`:296、`newSeparator`:302、`new_separator`:307、`get`:313
  - 方法 `set`:319、`press`:326、`reset`:333、`resetAll`:340、`reset_all`:346、`setOnChange`:359、`set_on_change`:365、`onChange`:370、`on_change`:375、`remove`:381
  - 方法 `clear`:388、`openPage`:395、`open_page`:401
- **CosmeticAnimationsAPI**（注册，top/aihmc/omnimorph/lua/api/CosmeticAnimationsAPI.java）
  - 方法 `setPage`:49、`set_page`:68、`onEvent`:97、`getEventError`:112
- **CosmeticClientAPI**（注册，top/aihmc/omnimorph/lua/api/CosmeticClientAPI.java）
  - 方法 `getCameraPos`:13、`getCameraRot`:18
- **CosmeticPlayerAPI**（注册，top/aihmc/omnimorph/lua/api/CosmeticPlayerAPI.java）
  - 方法 `getUUID`:22、`getName`:27、`getPos`:32、`getRot`:40、`getVelocity`:47、`isLoaded`:52、`isSneaking`:57、`isSprinting`:62、`isOnGround`:67、`getPose`:72
  - 方法 `getHealth`:77
- **CosmeticStateAPI**（注册，top/aihmc/omnimorph/lua/api/CosmeticStateAPI.java）
  - 方法 `get`:18、`set`:23
- **CosmeticTextureAPI**（注册，top/aihmc/omnimorph/lua/api/CosmeticTextureAPI.java）
  - 方法 `getTextures`:22、`newTexture`:27
- **YsmActionsAPI**（注册，top/aihmc/omnimorph/lua/api/ysm_actions/YsmActionsAPI.java）
  - 方法 `getActions`:40、`get_actions`:46、`getWheelActions`:52、`get_wheel_actions`:80、`getWheelPages`:86、`get_wheel_pages`:105、`getWheelLayout`:111、`get_wheel_layout`:127、`getWheelPageSlotAction`:133、`get_wheel_page_slot_action`:140
  - 方法 `triggerWheelPageSlot`:146、`trigger_wheel_page_slot`:153、`stopWheelPageSlot`:159、`stop_wheel_page_slot`:168、`bindWheelPageSlot`:174、`bind_wheel_page_slot`:199、`bindToggleWheelPageSlot`:205、`bind_toggle_wheel_page_slot`:232、`unbindWheelKeybind`:238、`unbind_wheel_keybind`:243
  - 方法 `bindAction`:249、`bind_action`:271、`bindToggleAction`:277、`bind_toggle_action`:303、`addWheelPage`:309、`add_wheel_page`:317、`renameWheelPage`:323、`rename_wheel_page`:331、`removeWheelPage`:337、`remove_wheel_page`:345
  - 方法 `getAction`:351、`get_action`:357、`newAction`:363、`new_action`:373、`register`:379、`trigger`:386、`stop`:412、`stop_all`:420、`stopAll`:426、`isActive`:435
  - 方法 `is_active`:441、`time`:447、`getWheelSlot`:454、`get_wheel_slot`:468、`setWheelSlot`:474、`set_wheel_slot`:482、`clearWheelSlot`:488、`clear_wheel_slot`:496、`clearWheelPage`:502、`clear_wheel_page`:510
  - 方法 `clearWheelPageSlot`:516、`clear_wheel_page_slot`:524、`swapWheelPageSlots`:530、`swap_wheel_page_slots`:538、`compactWheelPage`:544、`compact_wheel_page`:552、`autoFillWheelPage`:558、`auto_fill_wheel_page`:574、`refreshWheel`:580、`refresh_wheel`:590
- **YsmDisplayAPI**（注册，top/aihmc/omnimorph/lua/api/ysm_model/YsmDisplayAPI.java）
  - 方法 `get`:25、`isSynced`:43、`getFood`:49、`getExperienceLevel`:56、`isFlying`:63、`getMovementInput`:70、`getEffectLevel`:80、`getActionState`:91、`getControllerStates`:99
- **YsmModelAPI**（注册，top/aihmc/omnimorph/lua/api/ysm_model/YsmModelAPI.java）
  - 方法 `getPart`:37、`getParts`:44、`getRootParts`:51、`getLocator`:58、`getLocators`:65、`getBoneWorldMatrix`:76、`getBoneWorldPos`:83、`getLocatorWorldMatrix`:90、`getLocatorWorldPos`:97、`getAttachment`:104
  - 方法 `getAttachments`:111、`getAttachmentWorldMatrix`:122、`getAttachmentWorldPos`:129、`getTexture`:136、`setTexture`:143、`texture`:151、`isYsm`:157、`getKind`:163、`isNativeStateMachineEnabled`:170、`setNativeStateMachineEnabled`:177
  - 方法 `isNativeAnimationEnabled`:186、`setNativeAnimationEnabled`:193、`playAnimation`:202、`stopAnimation`:211、`getControllers`:220、`getControllerStates`:232、`getActionState`:244、`getNativeAnimation`:251、`getHandActions`:258、`getControllerState`:265
  - 方法 `getControllerStateTime`:272、`getControllerStateNames`:279、`getActiveAnimations`:289、`getFunctions`:311、`getEvents`:318、`getRecentEvents`:325、`getRecentSyncKeys`:332、`getActions`:339、`getControls`:350、`getSubEntities`:359
  - 元方法 `__index`:370
- **YsmActionDefinition**（注册，top/aihmc/omnimorph/model/ysm/action/YsmActionDefinition.java）
  - 方法 `getId`:38、`get_id`:43、`getTitle`:49、`get_title`:57、`setTitle`:63、`set_title`:70、`title`:75、`getAnimation`:81、`get_animation`:86、`setAnimation`:92
  - 方法 `set_animation`:98、`animation`:103、`getPage`:109、`get_page`:114、`setPage`:120、`set_page`:126、`page`:131、`isLoop`:137、`setLoop`:143、`set_loop`:149
  - 方法 `loop`:154、`getMode`:160、`get_mode`:165、`setMode`:171、`set_mode`:177、`mode`:182、`getCooldownTicks`:188、`get_cooldown`:193、`setCooldownTicks`:199、`set_cooldown`:205
  - 方法 `cooldown`:210、`getSpeed`:216、`get_speed`:221、`setSpeed`:227、`set_speed`:233、`speed`:238、`getItem`:244、`get_item`:249、`setItem`:255、`set_item`:261
  - 方法 `item`:266
- **YsmAttachmentPoint**（待追踪，top/aihmc/omnimorph/model/ysm/YsmAttachmentPoint.java）
  - 方法 `getTypeName`:37、`getRoleName`:43
- **YsmLocator**（待追踪，top/aihmc/omnimorph/model/ysm/YsmLocator.java）
  - 方法 `getRoleName`:28
- **YsmModelPart**（注册，top/aihmc/omnimorph/model/ysm/YsmModelPart.java）
  - 方法 `getName`:57、`getParent`:63、`getChildren`:69、`getPos`:75、`setPos`:84、`pos`:90、`getRot`:96、`setRot`:105、`rot`:111、`getScale`:117
  - 方法 `setScale`:126、`scale`:132、`getVisible`:138、`setVisible`:144、`visible`:156、`getOriginPos`:162、`getOriginRot`:168、`getOriginScale`:174、`getWorldMatrix`:180、`getWorldPos`:186
  - 方法 `resetPose`:192
