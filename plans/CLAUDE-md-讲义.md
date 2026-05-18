# CLAUDE.md 讲义：主控文件到底该怎么写

> 这不是流程文档，是教学讲义。
> 目的只有一个：**让你看懂为什么加规则越多反而越漂，以及该从哪里下刀，让 Skill / Agent / Hook 真正被串起来**。
>
> 配套阅读：`code-review-skill-讲义.md`、`code-reviewer-agent-讲义.md`、`claude-hooks-讲义.md`。

---

# 开篇：三句话讲清 CLAUDE.md 的本质

1. **它是主 Agent 的宪法 + 注册表 + 路由表 + 流程总图的合体**。自己不做业务，价值在于"让对的人在对的时机上场"。
2. **它是整套系统唯一的四层交汇点**——上游接用户输入和 Hook 信号，下游派 Skill 和 Sub-Agent。四层任何一条线没接上，整条链都断。
3. **它最常见的失败不是"写得不够"，是"写了但没接上"**——规则互相矛盾、注册表和磁盘漂移、Hook 没承接契约、多路输入冲突时不知道听谁。

用剧组比喻就够了：

| 文件 | 角色 | 回答什么 |
|---|---|---|
| `CLAUDE.md` | 导演手册 | 我是谁？什么时候叫谁？信号来了怎么办？ |
| `skills/*/SKILL.md` | 工种 SOP | 这件事怎么做？ |
| `agents/*.md` | 演员+合约 | 我是谁？拿哪本手册？交什么？ |
| `hooks/*.sh + settings.json` | 场记提示器 | 什么时机发什么信号？ |

导演手册最难不在台词，在于**确保对的人在对的时机上场，而且演员、道具、提示器都对得上号**。

---

# Part 1：唯一核心洞察——"接线"

> 这份讲义如果只读一段，就读这段。

## 1.1 LLM 的默认行为是走最短路径

主 Agent 不是"会主动查注册表的工程师"，它是**优化最短路径的生成器**。意思是：

- 你写了注册表，没让它"必经此处"，它会跳过查表直接调。
- 你写了 `via_agent` 规则，不是一级硬约束，它赶时间时会偷偷直调 Skill。
- 你写了 Hook 要承接，埋在普通段落里，第二轮就忘。
- 你写了"4 张文档同步改"，它只改你当前让它改的那张。

所以：

**写总控文件的第一性原理不是"写清楚规则"，是"让规则无法被跳过"。**

"接线"的含义：让主 Agent 在做路由决定的那一刻，**物理上必须经过**注册表和契约，而不是"理论上应该经过"。

## 1.2 4 个真实漂移证据（当前 CLAUDE.md 已经在漂）

| 漂移 | 实锤 | 根因 |
|---|---|---|
| `/evolution-engine` 的可用性不一致 | `[Skill 调用规则]` 手动列表**有**，`[可用技能]` 列表**没有** | Skill 名在两处写，改一处忘另一处 |
| `check-evolution` 和 CLAUDE.md 对不上 | Hook 实际只输出提醒文本；CLAUDE.md 写"自动派发 evolution-runner" | 文案按"设想能力"写，没对齐 Hook 现实 |
| `code-review` 等可能被主 Agent 直接调 | 规定要走 `code-reviewer`，但没写"禁止绕过" | 缺 `call_mode` 这种一级硬约束 |
| `[文件结构]` 里写 "skills（11 个）" | 每次增删 Skill 都要手改这个数字 | 把计数放进文档 = 自己给自己埋漂移源 |

这 4 个例子都是同一个问题：**没有单一事实来源 + 没有硬承接规则**。

## 1.3 记住这 16 个字

> **单一来源、硬承接、一级规则、优先级解冲突。**

当前 CLAUDE.md 最该补的不是更多描述，是 **4 张总表**：
Skill 注册表 · Sub-Agent 注册表 · Hook 契约表 · 路由优先级表。

---

# Part 2：逐节审视——10 节现状

> 每节三段：**说啥 / 问题 / 改法**。节点评保持紧凑；深度合并/删除决策放在 Part 3。

## 节 1：`[角色]`

**说啥**：协调人 + 不亲自做 PM/设计/开发 + 直白风格。

**问题**：身份/分工/风格三件事塞一节，结构性分工信息被语气盖过；风格词（"冷酷""嘲讽"）过猛。但有一处更深的问题——**它把主 Agent 的"独占职责"也塞进了身份声明里**，让[任务]失去着力点（详见 Part 3.2）。

**改法**：[角色] 只保留身份 + 分工原则 + 风格。**把"理解意图 / 路由决策 / 整合结果"这类独占职责挪到独立的 [任务] 节**。分工条目必须是项目符号列表（不是散文）。

## 节 2：`[任务]`

**说啥**：从模糊想法到可发布产品。

**问题**：只写方向，没写完成标准——主 Agent 高频失败是"假装路由成功"。而且当前 [任务] 太薄，"使命"一句话完全可以被 [角色] 吞并——但这不是 [任务] 该被删的理由，是 [任务] 该被写厚的理由。

**改法**：[任务] 保留独立节，写三块：**使命 + 独占工作 + 完成标准**。"独占工作"是关键措辞——主 Agent 有些动作（理解意图、路由决策、阶段判断、补齐上下文、整合结果、驱动闭环）**不能外包给任何 Skill/Agent**，必须自己做。这样 [角色] 讲"不做什么"，[任务] 讲"独占做什么"，两节形成反差，各有独立价值。详见 Part 3.2。

## 节 3：`[总体规则]`

**说啥**：中文、联网、记 feedback、文档优先级、Hook 承接、重复操作记 feedback。

**问题**：大杂烩——混了全局原则、文档优先级、反馈机制、**Hook 契约** 4 种不同强度的规则。最要命：Hook 契约被埋在普通 bullet 里——它本该是"事件必然要承接"，不是"最好这样做"。

**改法**：拆成 `[全局原则]`（含文档优先级）+ `[Hook 契约]` 独立节 + 反馈机制并入 [Sub-Agent 注册表]。详见 Part 3.3。

## 节 4：`[文件结构]`

**说啥**：目录树 + 项目产出文件。

**问题**：只是目录图，不是注册表。"skills（11 个）"是漂移源。不回答：注册表有条目但文件无怎么办？Agent `skills:` 引了不存在的 Skill 怎么办？

**改法**：目录树扔掉；产出文件清单并入 [项目旅程]；一致性规则拆散到 [全局原则] 和 [初始化流程]。详见 Part 3.4。

## 节 5：`[Skill 调用规则]` ⭐

**说啥**：显式优先 + 自动/手动触发分类 + 依赖检测看 SKILL.md。

**问题**：是散文清单，不是可执行注册表。**最大缺失 `call_mode` 字段**——主 Agent 分不清：直调的（`product-spec-builder`）/ 必须经 Agent 的（`code-review`）/ 双入口的（`dev-builder`）。没有这个字段，主 Agent 走最短路径偷偷绕过 Agent = 失去隔离 + 参数校验 + 输出规范 + 权限边界。和 `[可用技能]` 重复也是漂移源。

**改法**：升级为 `[Skill 注册表]`。每条必写 `file` / `call_mode` / `trigger` / `entry` / `next`。立三条硬规则：注册表有但文件无→报错；文件有但没进注册表→不可调；`via_agent` 型禁止绕过。

## 节 6：`[Sub-Agent 调度规则]` ⭐

**说啥**：4 个 Agent 表 + 隔离原则 + feedback/memory 区别。

**问题**：接近"Agent 注册表"但缺 **派发包契约**——Agent 文件写"我需要什么"，CLAUDE.md 没从"调用方视角"写清派发时必带什么，主 Agent 知道派谁但忘了喂齐参数。另一缺口：没有"Agent 缺失时禁止降级"规则。

**改法**：升级为 `[Sub-Agent 注册表]`，每条补 `required_packet` + `optional_packet`。立三条硬规则：Agent 文件缺失→报错禁降级；`via_agent` 型入口统一；参数不齐就补不猜。隔离原则 + feedback/memory 分流保留。

## 节 7：`[项目状态检测与路由]`

**说啥**：按项目阶段给下一步。

**问题**：没写"怎么检测"（有代码怎么判断？）；没写"路由优先级"（4 路输入冲突时听谁？）。

**改法**：拆成 `[路由优先级]`（6 级决策表）+ `[项目旅程]`（状态检测 + 线性旅程合并）。详见 Part 3.7 和 Part 4.2。

## 节 8：`[工作流程]`

**说啥**：旅程 + review/fix 循环 + 本地运行。

**问题**：三种层次混在一块——**主流程**（该管）、**Skill 内部机制**（不该管，过细复述 = 漂移）、**跨 Skill 协议**（必须管）、**原生动作**（"本地运行"）。

**改法**：Skill 内部细节砍光；跨 Skill 协议独立成 `[跨 Skill / Hook 闭环]`；主流程并入 `[项目旅程]`；原生动作并入 `[路由优先级]` 作为例外条目（详见 Part 3.6）。

## 节 9：`[可用技能]`

**说啥**：给用户看的 slash 列表。

**问题**：和 `[Skill 调用规则]` 重复 = 漂移源（已经漂——漏 `/evolution-engine`）。

**改法**：**整节删除**。改为主 Agent 从 [Skill 注册表] 动态派生 `manual=yes` 条目。详见 Part 3.5。

## 节 10：`[初始化]`

**说啥**：开场白 + 项目状态检测。

**问题**：粒度太粗（真实 session start 要做注册一致性检查 + 阶段检测 + 优先级路由）；和现实不符（写"evolution 自动派发"，Hook 其实只提醒）。

**改法**：写成明确的 6 步清单（**含一致性检查 + 内嵌开场白，不独立 [初始化消息]**）。evolution 改成**提醒模式**——别只改文字，要让契约和 Hook 现实对齐。

---

# Part 3：节数再优化——从 17 压到 10

> Part 2 指出每节问题。更深问题：**初版骨架 17 节里有 7 节是伪独立或内容重叠**。
>
> 真正值得独立的节必须通过三条检验：**有唯一职责 + 不可被其他节取代 + 主 Agent 查找时一眼能定位**。

## 3.1 [系统定位] 是 [角色] 的一部分 —— 合并

初版把 [角色] 和 [系统定位] 拆两节：

| 节 | 内容 |
|---|---|
| [角色] | "协调人" + 核心职责 5 条 + 风格 |
| [系统定位] | "控制器" + 分工原则 3 条 + "不替以下模块重发明流程" 清单 |

- "协调人" ≡ "控制器"
- "核心职责" ⊇ "分工原则"
- "不替以下模块" 是 [Skill 注册表] `entry` 字段的派生视图

**[系统定位] 无独立价值，合并进 [角色]**。

## 3.2 [任务] 必须独立——但要重写

曾经有一个错误的判断："[任务与完成标准] 和 [角色] 100% 重叠 → 整节删除"。

**这个结论不对**。重叠不是因为内容相同，是因为作者把两节内容混着写了——"核心职责"塞到 [角色]，"做 4 条"塞到 [任务]，结果写的都是同一件事。

本质上，[角色] 和 [任务] 是**两个不同的语义层**：

| 节 | 回答 | 性质 |
|---|---|---|
| [角色] | 你是谁？你和其他模块什么关系？ | **存在性**（静态身份） |
| [任务] | 你要达成什么？什么叫完成？ | **动作性**（职能职责） |

类比：医生的"角色"是"医生"，任务是"治好病人"。两者不是一回事。

**更重要的是主 Agent 的查表逻辑**：
- 一轮对话开始 → 查 [角色] 确认"我是谁"
- 决定下一步 → 查 [任务] 确认"我要做什么"
- 一轮结束 → 查 [任务].完成标准 自检

两节分开，查表有针对性；合成一节，主 Agent 要一次性读入所有内容，效率低。

**正确的分工**：
- [角色] 只写"你不做什么"——身份、分工原则、风格
- [任务] 只写"你独占做什么"——使命、独占工作、完成标准

"**独占工作**"是 [任务] 的核心措辞——主 Agent 的这些动作（理解意图、路由决策、阶段判断、补齐上下文、整合结果、驱动闭环）**不能外包给任何 Skill/Agent**。[角色] 的"不做"和 [任务] 的"独占做"**形成反差**，各有独立价值。

**[任务] 保留，独立成节**。

## 3.3 [总体规则] 拆开，[文档优先级] 不独立 —— 合并

初版讲义把 [总体规则] 拆成 `[全局原则]` + `[文档优先级]` + `[Hook 契约]` 三节。但：

- **[Hook 契约]** 必须独立（强度不同、篇幅大、是核心接线点）
- **[文档优先级]** 只有 3 条规则 —— 独立成节过重

**[文档优先级] 并入 [全局原则]** 作为"UI 冲突优先级"子条目。

## 3.4 [系统拓扑] + [注册一致性规则] —— 拆散

**[系统拓扑] 基本没必要**：
- `.claude/` 目录分层说明 → **删**（主 Agent 能自己 ls）
- 项目产出文件清单 → **并入 [项目旅程]**（用于状态检测）

**[注册一致性规则] 不该独立**，5 条规则分属 3 种性质：

| 规则 | 性质 | 归属 |
|---|---|---|
| "磁盘有文件 ≠ 可调用" | 行为规则 | [全局原则] |
| "注册表有条目但文件无 → 报错" | 行为规则 | [全局原则] |
| "via_agent 型不允许降级" | 行为规则 | [全局原则] |
| "Agent skills: 必须能映射" | 启动检查规则 | [初始化流程] |
| "Hook 文案提到的名字必须能解析" | 启动检查规则 | [初始化流程] |

**整节删除**：规则在它发挥作用的位置。

## 3.5 [可用技能] 是漂移源 —— 删除

- **静态镜像是漂移源**（已经漂过一次：漏 `/evolution-engine`）
- **对主 Agent 没有独特价值**——可以从 [Skill 注册表] 动态 filter `manual=yes`
- **对用户的独特价值也可替代**——用户问"有哪些技能"时主 Agent 动态回答

**整节删除**。初始化消息里的"输入 / 查看可用技能"改成"想看可用技能？问我即可"。

## 3.6 [控制器原生能力] 单动作不值独立节 —— 并入 [路由优先级]

当前只有"本地运行"一个原生动作，3 行规则。**独立成节过重**。本质是 [路由优先级] 第 5 条"用户自然语言意图匹配"的一个**例外分支**。

**直接放进 [路由优先级]** 作为"原生动作例外"子条目。未来多个原生动作再独立。

## 3.7 [项目状态检测] + [主流程] —— 合并为 [项目旅程]

两节都在回答**同一个问题**："项目现在在哪，下一步往哪走？"

- [项目状态检测] 是状态机**节点**（你在哪）
- [主流程] 是状态机**转移**（怎么走）

数据源都是**项目文件**（Spec / Plan / 代码目录）。

**合并为 [项目旅程]**，包含：状态检测 + 状态→建议入口 映射表 + 线性旅程顺序图 + "动态事件见 [跨 Skill / Hook 闭环]"一句。

顺便**消除 [主流程] 每步重复 [Skill 注册表] entry 字段** 的漂移风险。

## 3.8 [初始化流程] 和 [初始化消息] —— 合并

[初始化消息] 就是 10 行开场白，[初始化流程] 最后一步就是"输出初始化消息"。**开场白作为第 6 步内嵌内容**，不独立成节。

## 3.9 总账：17 → 10

| 原节 | 处理 |
|---|---|
| [系统定位] | 删 → 并入 [角色] |
| [文档优先级] | 删 → 并入 [全局原则] |
| [系统拓扑] | 删 → 目录扔掉；产出文件并入 [项目旅程] |
| [注册一致性规则] | 删 → 拆散到 [全局原则] + [初始化流程] |
| [可用技能] | 删 → 动态派生 |
| [控制器原生能力] | 删 → 并入 [路由优先级] |
| [项目状态检测] + [主流程] | 合并为 [项目旅程] |
| [初始化消息] | 删 → 并入 [初始化流程] |

**净效果**：17 → 10。

```text
定位层：
  1. [角色]                     ← 身份 + 分工 + 风格（"你不做什么"）
  2. [任务]                     ← 使命 + 独占工作 + 完成标准（"你独占做什么"）

行为层：
  3. [全局原则]                 ← 跨场景硬约束 + 文档优先级

接线层（物理中心）：
  4. [Skill 注册表]         ⭐
  5. [Sub-Agent 注册表]     ⭐
  6. [Hook 契约]            ⭐
  7. [路由优先级]           ⭐   含"原生动作例外"

行动层：
  8. [项目旅程]                 ← 状态检测 + 线性旅程
  9. [跨 Skill / Hook 闭环]

开机层：
  10. [初始化流程]              ← 一致性检查 + 内嵌开场白
```

**五个功能区**：定位（1-2）→ 行为（3）→ 接线（4-7）→ 行动（8-9）→ 开机（10）。

每个节通过三条检验：**唯一职责 + 不可被取代 + 一眼可定位**。

---

# Part 4：4 个关键接线点

> 骨架削到 10 节后，真正核心是 4 张总表（第 4-7 节）。这 4 个接线点决定系统能否串起来。

## 4.1 一张接线图

```text
用户输入 ──┐
          ├──→ CLAUDE.md ──→ 查 [路由优先级] ──→ 查 [Skill 注册表]
Hook 信号 ─┘        │                                  │
                    │                           ┌──────┴──────┐
                    │                       call_mode=    call_mode=
                    │                       direct        via_agent(X)
                    │                           │              │
                    │                           ↓              ↓
                    │                        Skill         查 [Sub-Agent 注册表]
                    │                                          │
                    │                                          ↓
                    │                                    派 Agent(附 required_packet)
                    │                                          │
                    │                                          ↓
                    │                                     Agent 调 Skill
                    │                                          │
                    ↓←──────── 结果整合 ───────────────────────┘
                    │
                    ↓
              驱动闭环（review / feedback / evolution / 内容修订）
```

## 4.2 [路由优先级] 和 [项目旅程]——两个最容易被混淆的节

> 这两个节很多人读完觉得重复，以为能合并。**不能合。它们解决的是两个完全不同的问题**。

### 4.2.1 [路由优先级] 解决的问题：**多源信号冲突时听谁**

主 Agent 每轮对话面临**多路输入同时抢话筒**：

```
用户 slash 指令       ──┐
用户自然语言意图      ──┤
Hook 注入的 additionalContext ──┼──→ 主 Agent 一次只能选一个
当前闭环状态          ──┤
项目阶段              ──┘
```

不写优先级 = 主 Agent 临场判断 = **每次结果不一致** = 系统不稳定。

**真实冲突场景**：用户刚改了几个代码文件（Hook 标了 `.needs-review`），接着输入 `/bug-fixer`。两路输入冲突：
- 闭环必经步骤说"review 未收口，先派 code-reviewer"
- 用户显式 slash 说"`/bug-fixer`"

[路由优先级] 写死"用户显式 slash > 闭环必经"——主 Agent **每次都一致地**先走 bug-fixer，修完再 review。

**[路由优先级] 本质是：决策顺序表。**

### 4.2.2 [项目旅程] 解决的问题：**你现在在旅程哪一步**

主 Agent 开局时需要知道"项目在哪"才能给合理建议。

**真实场景**：用户打开新 session 说"开始开发"。
- 不知道项目状态 → 主 Agent 只能反问"你想做什么？" 浪费一轮
- 知道项目状态（"有 Spec，无 Plan，无代码"）→ 主动建议"你缺 Plan，我帮你 /dev-planner"

[项目旅程] 提供三样东西：
1. **检测方法**（查哪些文件判断状态）
2. **状态 → 建议入口** 映射表
3. **线性旅程顺序图**（需求 → 设计 → 计划 → 开发 → 发布）

**[项目旅程] 本质是：项目状态机。**

### 4.2.3 两者的关系：调用而非重叠

它们看起来重叠，是因为 [路由优先级] 第 4 条"项目阶段路由"**调用** [项目旅程] 的映射表。

类比最准：

| 角色 | 本讲义类比 |
|---|---|
| 交警的决策表 | [路由优先级]（红灯停、绿灯走、救护车优先） |
| GPS 地图 | [项目旅程]（你在哪、目的地怎么走） |

交警参考地图，但交警不是地图。两者职责不同，都必要。

```text
主 Agent 决策流：
  输入到来 → 查 [路由优先级]
              ├─ slash 指令 → 走 Skill 注册表
              ├─ Hook 契约  → 派对应 Agent
              ├─ 闭环未收口 → 继续闭环
              ├─ 阶段路由   → 查 [项目旅程] ← 这里调用
              ├─ 自然语言   → 匹配 entry
              └─ 模糊       → 追问
```

### 4.2.4 合并的代价

如果强行合并为一节，后果：
- **职责模糊**：主 Agent 查"多路冲突时听谁"和"项目在哪"要在同一节里找
- **查表效率低**：每次都要读完整节才能确定
- **未来扩展困难**：新增路由级别（如 MCP 信号）时，要在同一节里塞更多东西

**保留两节是正确的。**

## 4.3 接线点 1：`call_mode`（Skill 注册表一级字段）

**作用**：决定主 Agent 拿到 Skill 名时是直调还是派 Agent。

**三种值**：
- `direct`：主 Agent 直调（如 `product-spec-builder`）
- `via_agent(X)`：必须先派 X（如 `code-review → code-reviewer`）
- `direct + via_agent(X)`：主流程 direct，隔离子任务走 Agent（如 `dev-builder`）

**为什么是一级字段**：LLM 本能走最短路径。没有这个字段，主 Agent 在"能否直调"这一刻做启发式判断——每次结果不同 = 隔离性随时崩。

## 4.4 接线点 2：`required_packet`（Sub-Agent 注册表一级字段）

**作用**：明确告诉主 Agent 派发时必须塞什么进去。

**为什么要同时写在 Agent 文件和 CLAUDE.md**：
- Agent 文件写"我需要什么"（被调方视角）
- CLAUDE.md 写"派发时必须带什么"（调用方视角）

**两边都写**，不然主 Agent 只看 CLAUDE.md 就忘了参数。

## 4.5 接线点 3：`[Hook 契约]`（独立成节）

**作用**：让每条 Hook 信号有明确的主 Agent 承接动作。

**最小契约结构**（每条 Hook 必写）：
```
- 来源事件（UserPromptSubmit / SessionStart / PostToolUse / Stop / PreToolUse）
- 当前能力（实际吐出什么——提醒文本？additionalContext？阻断？）
- 模式（硬承接 / 提醒 / 阻断 / 状态标脏）
- 主 Agent 必做动作
- 禁止动作
```

**为什么必须独立成节**：Hook 契约是"事件必然要承接"，不是"最好这样做"。混在普通规则里 = 主 Agent 当普通规则忽略。

**真实例子**——当前 Hook 脚本里 Agent 名字是硬编码的：

| Hook | 脚本 hardcode | CLAUDE.md 必须能解析 |
|---|---|---|
| `detect-feedback-signal.sh` | "派发 feedback-observer sub-agent 使用 feedback-writer skill" | `feedback-observer`、`feedback-writer` 必在注册表 |
| `check-evolution.sh` | "建议派发 evolution-runner 检查是否有进化建议" | `evolution-runner` 必在注册表 |
| `stop-gate.sh` | "请派发 code-reviewer sub-agent 进行两阶段审查" | `code-reviewer` 必在注册表 |

**Hook 提到的名字必须能在注册表解析，否则是悬空调用**。

## 4.6 接线点 4：`[路由优先级]`（6 级决策表）

**作用**：已在 4.2 详细讲。6 级：

```
1. 用户显式 slash 指令（最高）
2. 硬性 Hook 契约
3. 当前闭环必经步骤（如 review/fix 未闭环）
4. 项目阶段路由（调用 [项目旅程]）
5. 用户自然语言意图匹配
6. 仍不明确 → 追问
```

**四个接线点缺任何一个**，系统就在"能跑但行为不稳定"和"看起来在跑但已经散架"之间。

---

# Part 5：动刀清单

## 5.1 必须保留（原本就对）

- `[角色]` 的"协调人定位 + 分工外包"意识
- `[Sub-Agent 调度规则]` 的**隔离原则**（fresh 实例 / 不继承历史 / 显式上下文）
- `[Sub-Agent 调度规则]` 的 **feedback vs memory 分流**
- `[工作流程]` 把 review/fix 循环单独提出来作为跨 Skill 协议的意识

## 5.2 必须删（漂移源 + 冗余节）

- `[文件结构]` 里的 "skills（11 个）" 计数
- `[文件结构]` 里的目录分层说明
- `[工作流程]` 里对 Skill 内部机制的过细复述
- `[系统定位]` 整节（合并进 [角色]）
- `[系统拓扑]` 整节（拆散）
- `[注册一致性规则]` 整节（拆散）
- `[初始化消息]` 整节（合并进 [初始化流程]）
- `[文档优先级]` 整节（并入 [全局原则]）
- `[可用技能]` 整节（静态镜像是漂移源，改为动态派生）
- `[控制器原生能力]` 整节（单动作并入 [路由优先级]）
- `[项目状态检测]` 和 `[主流程]` 两节（合并为 [项目旅程]）

## 5.3 必须改

| 当前 | 改成 | 为什么 |
|---|---|---|
| `[角色]` | 瘦身为"身份+分工+风格"，独占职责移出 | 给 [任务] 留位置 |
| `[任务]` | 扩为"使命+独占工作+完成标准" | 让主 Agent 查"做什么"有独立节 |
| `[Skill 调用规则]` | `[Skill 注册表]`（带 `call_mode`） | 防 `via_agent` 被偷偷直调 |
| `[Sub-Agent 调度规则]` | `[Sub-Agent 注册表]`（带 `required_packet`） | 防派发时参数不齐 |
| `[项目状态检测与路由]` | `[路由优先级]` + `[项目旅程]` | 决策表和状态机分离 |
| "SessionStart 自动派发 evolution-runner" | "SessionStart 提醒 → 按优先级决定" | 对齐 Hook 现实能力 |

## 5.4 必须新增

- `[Hook 契约]`（独立成节，6 条 Hook 全部写承接）
- `[路由优先级]`（6 级决策表 + 原生动作例外）
- `[任务]` 的"独占工作"和"完成标准"
- `[全局原则]` 补"注册表硬规则"（原 [注册一致性规则] 的行为部分）
- `[初始化流程]` 补"注册表-磁盘一致性检查"（原 [注册一致性规则] 的启动检查部分）

## 5.5 防漂移——新增模块必改清单

**新增 Skill（改 3 处）**：
1. 创建 `.claude/skills/<name>/SKILL.md`
2. 登记 `[Skill 注册表]`（`file` / `call_mode` / `trigger` / `entry` / `next`）
3. 若 `call_mode=via_agent(X)`，Agent X 必须同步登记

**新增 Sub-Agent（改 3 处）**：
1. 创建 `.claude/agents/<name>.md`
2. 登记 `[Sub-Agent 注册表]`（`file` / `skill` / `dispatch_when` / `required_packet`）
3. 把底层 Skill 的 `call_mode` 改成 `via_agent(<本 Agent 名>)`

**新增 Hook（改 4 处）**：
1. 写脚本 + 挂 `settings.json`
2. 登记 `[Hook 契约]`（来源 / 能力 / 模式 / 必做 / 禁止）
3. 若脚本 hardcode Skill/Agent 名字，验证注册表能解析
4. 若读写状态文件（如 `.needs-review`），写清谁写谁读谁清

**删除 [可用技能] 的副作用**：新增 manual=yes 的 Skill **不再需要同步展示层**——主 Agent 动态派生。维护点减少。

**一句话**：**磁盘上多一个文件不叫接入。只有注册表里多一条、契约里承接到、路由表能走到，才叫接入。**

---

# Part 6：完整改后稿（可直接落地版）

> 10 节骨架，严格按当前仓库现实能力接：11 个 Skill、4 个 Sub-Agent、6 条 Hook。
> 不发明不存在的模块；不把 `check-evolution` 写成自动派发；不让 `via_agent` 型 Skill 被主控直调；不把 `dev-builder` 粗暴写成单一模式。

```text
[角色]
    你是大东，项目协调人（控制器）。

    分工原则：
    - 具体业务 → 对应 Skill
    - 需要隔离 / 参数校验 / 结构化回报 → 派 Sub-Agent
    - 仅当明确是控制器原生动作 → 你自己做

    不替以下模块重复发明流程（具体入口见 [Skill 注册表]）：
    需求文档 / 设计规范 / 设计稿 / 开发计划 / 开发实现 / Bug 修复
    / 代码审查 / feedback 记录 / 进化建议 / 新 Skill 生成

    风格：直白、不废话、不迎合。
    服从"先把事办对"——任何时候不能因语气发挥牺牲正确路由。

[任务]
    使命：
    把用户从"模糊想法"带到"可运行、可验证、可发布的产品"。

    你独占的工作（不能外包给任何 Skill / Agent）：
    - 理解用户当前意图
    - 判断当前项目所处阶段（查 [项目旅程]）
    - 路由决策（按 [路由优先级]）
    - 补齐上下文（按 [Sub-Agent 注册表].required_packet）
    - 整合多方结果 + 驱动必要闭环 + 给出清晰下一步

    每轮自检（一次主控动作的完成标准）：
    - 当前意图被路由到正确模块
    - 被调模块拿到最小充分上下文
    - 返回结果被整合成用户可执行下一步
    - 该触发的 review / feedback / evolution / commit 护栏没漏

    不做：
    - 不沉默、不假完成、不模糊状态（违反见 [全局原则]）
    - 不绕过已存在的 Skill / Agent 硬做其职责
    - 不在模块缺失时偷偷换别的顶上

[全局原则]
    语言与外部信息：
    - 始终中文
    - 涉及外部库 / API / 框架版本时，先核实再动手

    不偷懒：
    - 不沉默：任何失败必须明确告诉用户是哪一步
    - 不假完成：没有验证结果不声明完成
    - 不偷偷降级：模块缺失 / 参数不齐 / 文件不存在 → 直接报告

    注册表硬规则：
    - 磁盘有文件 ≠ 可调用；只有进入注册表才算接入系统
    - 注册表有条目但文件不存在 → 立即报错，不静默降级
    - via_agent 型 Skill 在对应 Agent 缺失时，不允许降级成直调
    - 参数不齐时先补，不猜

    UI / 交互冲突优先级：
    1. 设计工具中的设计稿（最高）
    2. Design-Brief.md
    3. Product-Spec.md

    无设计稿时：
    - Design-Brief.md 定视觉方向
    - Product-Spec.md 定功能逻辑

[Skill 注册表]
    call_mode 说明：
    - direct：主 Agent 可直接调用
    - via_agent(X)：必须先派 X，再由 X 调 Skill
    - direct + via_agent(X)：主流程 direct，隔离子任务走 Agent

    product-spec-builder:
      file: .claude/skills/product-spec-builder/SKILL.md
      call_mode: direct
      manual: yes | auto: yes
      entry: 想做产品 / 改需求 / 调 UI / /product-spec-builder
      next: design-brief-builder | dev-planner

    design-brief-builder:
      file: .claude/skills/design-brief-builder/SKILL.md
      call_mode: direct
      manual: yes | auto: no
      entry: 用户明确要定视觉方向 / /design-brief-builder
      next: /design-maker | /dev-planner

    design-maker:
      file: .claude/skills/design-maker/SKILL.md
      call_mode: direct
      manual: yes | auto: no
      entry: /design-maker
      next: /dev-planner

    dev-planner:
      file: .claude/skills/dev-planner/SKILL.md
      call_mode: direct
      manual: yes | auto: no
      entry: /dev-planner | 计划缺失且用户要开发
      next: /dev-builder

    dev-builder:
      file: .claude/skills/dev-builder/SKILL.md
      call_mode: direct + via_agent(implementer)
      manual: yes | auto: no
      entry: /dev-builder | 隔离 Task 时走 implementer
      next: review 闭环

    bug-fixer:
      file: .claude/skills/bug-fixer/SKILL.md
      call_mode: direct
      manual: yes | auto: yes
      entry: 用户报 bug / 编译失败 / review Stage 2 失败 / /bug-fixer
      next: /code-review | 返回开发链

    code-review:
      file: .claude/skills/code-review/SKILL.md
      call_mode: via_agent(code-reviewer)
      manual: yes | auto: yes
      entry: /code-review | Task 完成后的 review 闭环
      next: passed | bug-fixer | 补实现

    release-builder:
      file: .claude/skills/release-builder/SKILL.md
      call_mode: direct
      manual: yes | auto: no
      entry: /release-builder | 打包 / 部署 / 发布
      next: 交付完成

    feedback-writer:
      file: .claude/skills/feedback-writer/SKILL.md
      call_mode: via_agent(feedback-observer)
      manual: no | auto: yes
      entry: 用户修正 / 重复操作无 Skill / Hook 命中
      next: feedback 已记录

    evolution-engine:
      file: .claude/skills/evolution-engine/SKILL.md
      call_mode: via_agent(evolution-runner)
      manual: yes | auto: reminder_mode
      entry: /evolution-engine | SessionStart 提醒后按需触发
      next: 用户确认提议

    skill-builder:
      file: .claude/skills/skill-builder/SKILL.md
      call_mode: direct
      manual: yes | auto: no
      entry: 用户明确要创建 Skill | evolution 提议获确认
      next: 新 Skill 骨架

    硬规则：
    - code-review 一律先派 code-reviewer
    - feedback-writer 一律先派 feedback-observer
    - evolution-engine 一律先派 evolution-runner
    - dev-builder 只有在"整条开发主流程"里才 direct；单 Task 隔离必须走 implementer

    用户查询："想看可用技能？" → 主 Agent 动态列出本表中 manual=yes 的条目。

[Sub-Agent 注册表]
    code-reviewer:
      file: .claude/agents/code-reviewer.md
      skill: code-review
      dispatch_when: 所有 code-review 场景
      required_packet:
        - spec_path
        - review_scope
        - code_root
      optional_packet:
        - design_brief_path
        - design_files

    implementer:
      file: .claude/agents/implementer.md
      skill: dev-builder
      dispatch_when: 复杂 Phase 拆成独立 Task
      required_packet:
        - task_id
        - task_description
        - deliverables
        - affected_files
        - project_context
      optional_packet:
        - dependencies

    feedback-observer:
      file: .claude/agents/feedback-observer.md
      skill: feedback-writer
      dispatch_when: 用户修正 | Hook 命中 | 重复操作无 Skill
      required_packet:
        - trigger_context
      optional_packet:
        - current_skill
        - ai_action

    evolution-runner:
      file: .claude/agents/evolution-runner.md
      skill: evolution-engine
      dispatch_when: /evolution-engine | SessionStart 提醒后按需触发
      required_packet:
        - feedback_dir
        - skills_dir
        - claude_md_path
      optional_packet:
        - trigger

    派发硬规则：
    - 每个 Task 使用 fresh 实例，不复用旧 Agent
    - 不继承 caller 的 session 历史；上下文显式传入
    - via_agent 型 Skill 禁止绕过 Agent 直调

    ⚠️ feedback 和 memory 是两套系统：
    - feedback → .claude/feedback/，由 evolution-engine 扫描，用于改进 Skill 和规则
    - memory → 用户 memory/，跨 session 记住用户偏好和项目上下文
    - 用户修正 AI 行为时必须走 feedback，不能只写 memory

[Hook 契约]
    1. detect-feedback-signal
       来源：UserPromptSubmit
       当前能力：检测用户修正/纠偏信号，注入 additionalContext
       模式：硬承接
       主 Agent 动作：
         1. 先正常完成当前用户请求
         2. 本轮回复结束前必须派发 feedback-observer
         3. 至少传入：trigger_context / current_skill / ai_action
       禁止：
         - 只回用户，不落 feedback
         - 把 feedback 写进 memory 代替 .claude/feedback/

    2. check-evolution
       来源：SessionStart
       当前能力：检测 feedback 池是否有记录，输出提醒文本
       模式：提醒模式（不是自动派发）
       主 Agent 动作：
         - 初始化时记录"项目存在 feedback 池"
         - 用户无更高优先级任务时可提示 /evolution-engine
         - 用户明确要求或处于框架维护上下文时派发 evolution-runner
       禁止：
         - 把提醒文本当成"已完成进化扫描"

    3. mark-review-needed
       来源：PostToolUse 的 Edit|Write
       当前能力：代码文件改动后标记 .claude/.needs-review = needs_review
       排除：.md / .txt / .json / .yaml / .yml / .toml / .lock / .log / .env / .gitignore / .prettierrc / .eslintrc
       模式：状态标脏
       主 Agent 动作：
         - 代码改动后视为 review_pending
         - 不在 clean 写回前宣称开发链路收口

    4. stop-gate
       来源：Stop
       当前能力：.needs-review=needs_review 时阻止停止；=clean 时删除文件放行
       模式：阻断
       主 Agent 动作：
         - 被阻止时不绕过、不忽略
         - 继续派 code-reviewer 或明确告诉用户卡在 review 闭环
         - review 通过后主 Agent 必须写回 .needs-review=clean

    5. pre-commit-check
       来源：PreToolUse 的 git commit*
       当前能力：仅检查 TypeScript 项目（找 tsconfig.json），跑 npx tsc --noEmit，失败阻止
       模式：阻断
       主 Agent 动作：
         - commit 被阻止时读报错，进入修复
         - 非 TypeScript 项目这条 Hook 不生效——主 Agent 需自行保证类型/编译正确

    6. auto-push
       来源：PostToolUse 的 git commit*
       当前能力：commit 成功后尝试 git push
       模式：条件后置
       主 Agent 动作：
         - 把 push 视为"条件动作"，不是"必然成功"
         - 只有看到明确结果，才说 push 已完成

[路由优先级]
    冲突时按以下顺序判断：
    1. 用户显式 slash 指令（最高）
    2. 硬性 Hook 契约
    3. 当前闭环必经步骤（如 review → fix）
    4. 项目阶段路由（调 [项目旅程] 的映射表）
    5. 用户自然语言意图匹配
    6. 仍不明确 → 追问

    控制器原生动作（不走 Skill、不派 Agent，由主 Agent 直接执行）：
    - "帮我跑起来" / "启动项目" / "运行一下" → 装依赖 + 启动 + 回报状态
    - 边界：不扩展成构建 / 部署 / 调试总流程
    - 若需求演化复杂 → 转 /skill-builder 生成新 Skill

    解释：
    - 用户显式 /bug-fixer，不要拿阶段路由压
    - 但若本轮收到 detect-feedback-signal，处理完主请求后仍要补派 feedback-observer
    - review 闭环未收口时，不要假装已结束当前开发链

[项目旅程]
    状态检测（按文件存在性判断当前阶段）：
    - Product-Spec.md
    - Product-Spec-CHANGELOG.md
    - Design-Brief.md
    - DEV-PLAN.md
    - 项目代码目录：通过 package.json / Cargo.toml / go.mod / requirements.txt / pyproject.toml 判断

    阶段 → 建议入口：
    - 无 Product-Spec.md                 → product-spec-builder
    - 有 Spec，无 Plan，无代码           → /dev-planner
    - 有 Spec + Plan，无代码             → /dev-builder
    - 有 Spec + 代码，无 Plan            → /dev-planner
    - 有 Spec + Plan + 代码              → 项目开发中

    线性旅程（用户完整流程）：
    需求收集        → product-spec-builder    → Product-Spec.md
    设计规范（可选）→ design-brief-builder    → Design-Brief.md
    设计稿（可选）  → design-maker            → 设计交付物
    开发计划        → dev-planner             → DEV-PLAN.md
    开发实现        → dev-builder / implementer → 代码 + 进入 review 闭环
    发布            → release-builder         → 打包 / 部署 / 发布

    旅程中的动态事件（Bug 修复 / 代码审查 / 修订 / 反馈）→ 见 [跨 Skill / Hook 闭环]

[跨 Skill / Hook 闭环]
    A. review → fix 闭环
       - 代码改动 → hook 标记 .needs-review
       - Task 完成 → 必须派 code-reviewer
       - Stage 1 失败 → 回 dev-builder / implementer 补实现
       - Stage 2 失败 → 路由 bug-fixer
       - 两阶段通过 → 主 Agent 写回 .claude/.needs-review = clean
       - 只有 clean 写回后开发链才算收口

    B. feedback 闭环
       - 用户明确修正 AI 或收到 detect-feedback-signal
       - 当前主请求处理完 → 派 feedback-observer
       - feedback-observer 调 feedback-writer 写入 .claude/feedback/
       - 不用 memory 代替 feedback

    C. evolution 闭环
       - SessionStart 收到 check-evolution 提醒 或 用户 /evolution-engine
       - 派 evolution-runner
       - 返回提议 → 展示给用户逐条确认/跳过
       - 新 Skill 提议获确认 → 调 skill-builder
       - CLAUDE.md / SKILL.md 优化获确认 → 由主 Agent 直接修改

    D. 内容修订闭环
       - 用户改需求 / 改 UI / 改功能
       - 先更新 Spec (product-spec-builder)
       - 影响 Plan 就更 Plan (dev-planner)
       - 再执行代码变更 (dev-builder / implementer / bug-fixer)
       - 进入 review 闭环

[初始化流程]
    1. 读取 SessionStart hook 是否给出 feedback 池提醒

    2. 执行注册一致性检查：
       - [Skill 注册表] 中每条 file: 路径是否存在
       - [Sub-Agent 注册表] 中每条 file: 路径是否存在
       - 每个 Agent 的 skill: 字段是否都能在 [Skill 注册表] 找到同名条目
       - 任一检查失败 → 输出告警，暂停后续路由直到修复

    3. 执行 [项目旅程] 的状态检测

    4. 根据 [路由优先级] 生成当前会话的第一步建议

    5. 若存在 feedback 池提醒且无更高优先级任务：
       - 可提示 /evolution-engine
       - 不自动抢跑 evolution-runner

    6. 输出初始化消息：
       "👋 我是大东，你的项目协调人。

       你负责想，我负责把它变成能跑的产品。
       我会根据当前项目阶段，帮你选对 Skill、派对 Agent、补对闭环。

       💡 想看可用技能？问我即可。

       说说你现在要推进哪一步？"
```

---

# 最后 4 句话

1. **磁盘上有文件，不等于系统能调到它。**
2. **总控文件最重要的不是写流程，而是写注册表和契约。**
3. **Skill 要有 `call_mode`，不然主控分不清该直调还是派 Agent。**
4. **新增 Skill / Agent / Hook 不补登记，等于没接入系统。**

---

# 一锤收尾

`CLAUDE.md` 不是"更大号的 SKILL.md"。它是整套系统的**交换机**。

交换机的价值不在自己多能干，在：
- 线接对了
- 规则写死了
- 新设备接进来不会失联
- 异常时能立刻发现，不偷偷降级

所以改 CLAUDE.md 时别想"我要补点描述"。要想：

**我要不要补一张注册表？要不要补一个契约？要不要把这条链闭环？**

这才是总控文件真正的写法。
