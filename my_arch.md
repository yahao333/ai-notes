# AI 重生爽文生成器 - 技术架构解构

## 1. 项目概览与定位
- **项目类型**：自动化工作流 / 文本生成（AI 辅助创作）
- **核心功能**：基于大语言模型，通过“世界观设定 -> 主线大纲 -> 章节细纲 -> 正文生成”的结构化工作流，自动化创作符合中国网文市场（特别是“重生/爽文”题材）的长篇小说。

## 2. 系统架构解析
### 2.1 整体架构图（文字描述）
- **前端交互层**：基于 React 构建的 SPA（单页应用），提供分步向导式的交互界面（Setup -> Characters -> Plot -> Writing），支持实时流式输出展示和配置管理。
- **后端服务层**：无独立后端（纯前端架构），直接在客户端通过 Fetch API / SDK 调用外部大模型 API。
- **AI 模型层**：双模型供应商支持。默认使用 Google Gemini (gemini-3-pro-preview)，兼容 Aliyun 通义千问 (qwen-max)。
- **数据存储层**：利用浏览器 `localStorage` 实现前端本地持久化（自动保存与恢复项目进度）。
- **外部集成层**：集成 `@google/genai` SDK 和 Aliyun DashScope REST API。

### 2.2 技术栈清单
| 层级 | 技术组件 | 作用说明 | 可替代方案 |
|------|---------|---------|-----------|
| 前端框架 | React 19 + TypeScript | 构建组件化用户界面和状态管理 | Vue 3, Svelte |
| 样式方案 | Tailwind CSS | 快速实现响应式和暗黑主题 UI | UnoCSS, Styled Components |
| AI 集成 | `@google/genai`, Fetch API | 与大模型进行 JSON 结构化输出和流式对话 | OpenAI SDK, LangChain.js |
| 状态管理 | React Hooks (`useState`, `useEffect`) | 管理复杂的生成步骤、表单数据和本地缓存 | Zustand, Redux Toolkit |
| Markdown | `react-markdown` | 渲染大模型输出的富文本内容 | marked.js |

## 3. AI Agent 核心设计（重点）
### 3.1 Agent 类型识别
- [x] **Plan-and-Solve（规划-执行）**：核心模式，先规划世界观和大纲，再执行具体章节生成。
- [x] **自动化工作流（Workflow）**：固定步骤的流水线作业，将复杂任务拆解为确定性的子任务。

### 3.2 Agent 决策流程
系统采用**链式生成（Chain of Generation）**的决策流程，上一步的输出严格作为下一步的输入：
```text
输入 (一句话脑洞) 
  → [步骤1: 生成世界观与角色 (JSON)] 
  → [步骤2: 基于世界观和角色，生成主线大纲 (JSON)] 
  → [步骤3: 基于大纲，生成前N章细纲 (JSON)] 
  → [步骤4: 基于细纲和上下文，流式生成章节正文 (Text)]
  → [循环: 压缩历史剧情生成记忆摘要] → [生成后续细纲] → [生成后续正文]
```

### 3.3 记忆与上下文管理
- **短期记忆机制**：在生成每一章正文时，将“世界观”、“角色设定”、“本章细纲”以及“上一章末尾内容（prevContext）”作为短期上下文注入。
- **长期记忆机制（上下文窗口优化）**：
  - 采用**动态摘要压缩（Story History Compression）**策略。
  - 随着章节增加，不直接传递全文，而是调用 `compressStoryHistory` 方法，让 AI 扮演“网文编辑”，将前 N 章内容压缩为 1000 字以内的“剧情回顾/记忆摘要”。
  - 摘要重点提取：主角等级变化、关键宝物、主要敌人，以及**极其关键的情感进度（主角与各女主的好感度、互动事件）**和未填伏笔。
  - 这个压缩后的摘要（`storySummary`）会被注入到后续的细纲和正文生成中，防止模型遗忘设定或产生幻觉，同时极大地节省了 Token 消耗和处理延迟。

## 4. 核心提示词工程（重点）
### 4.1 系统提示词（System Prompt）
**角色定义与行为约束**（用于角色与世界观生成）：
```text
你是一位专门服务于中国年轻男性的网文大神，最擅长写"重生"、"都市/玄幻后宫"、"无敌流"爽文。
你的文风要骚气、热血、直白，深谙读者的爽点。

【核心要求】
1. **主角设定**：必须是男性，性格杀伐果断，不圣母，智商在线，拥有绝对逆天的金手指（系统、神器、前世记忆等）。
2. **后宫团设定**：必须至少设计 3-4 位不同类型的极品美女作为主要配角...每个人物都要有极其惊艳的外貌描写关键词...
3. **反派设定**：反派要嚣张跋扈...专门用来给主角打脸，也就是"经验包"。
4. **世界观**：要有等级森严的制度，方便主角通过升级来打破规则，装逼打脸。
```

### 4.2 任务提示词模板

**功能名称**: 章节正文生成 (Chapter Content Generation)

**提示词模板**:
```text
你现在是全网最火的爽文作家。请根据以下大纲撰写第 {{chapterNumber}} 章的正文。

【章节信息】
标题：{{title}}
梗概：{{summary}}
爽点：{{coolPoint}}
核心规则：{{rules}}

{{if storySummary}}
【前情提要 / 长期记忆】
(请参考此内容保持人设和剧情连贯，特别是男女主关系)
{{storySummary}}
{{endif}}

【上下文】
上一章内容：{{prevContext || "这是第一章，直接开始"}}

【世界与人物】
世界风格：{{worldTheme}}
人物设定：
{{charContext}}

【写作要求】
1. **文风**：小白文风格，短句为主，节奏极快。不要文青，不要谜语人。
2. **感官描写**：
   - 对女性角色：重点描写身材、五官、声音和气味。
   - 对打脸情节：描写反派的嚣张嘴脸（前）和震惊、恐惧的表情（后），形成强烈对比。
   - 对路人反应：要有大量的"倒吸一口凉气"、"目瞪口呆"等侧面描写来衬托主角的牛逼。
3. **对话**：要口语化，装逼台词要够硬，撩妹台词要够骚。
4. **字数**：2000字左右。
5. **排版**：段落之间空一行，方便手机阅读。

{{if additionalInstructions}}
【特别修订指令】
用户对本次写作有以下特别要求，请务必在文中体现：
{{additionalInstructions}}
{{endif}}
```

### 4.3 提示词优化技巧
- **Structured Output (结构化输出)**：大量使用 JSON Schema 强制模型输出结构化数据（如角色数组、大纲数组），确保前后端数据流转的稳定性。针对 Aliyun 兼容模式，将 Schema 直接注入到 Prompt 尾部。
- **Context Injection (上下文拼接)**：动态拼接前置步骤的输出（如人物列表、世界观）作为后续步骤的约束条件。
- **Instruction Override (指令覆盖)**：在生成正文和后续细纲时，提供 `additionalInstructions`（用户指定剧情走向），赋予其最高优先级，实现人机协同创作。
- **容错与重试机制**：封装了 `retryOperation`，针对 429 (Rate Limit) 和 503 错误，采用 `[2s, 10s, 30s, 60s]` 的退避重试策略，提高长流程生成的成功率。

## 5. 关键算法与业务逻辑
- **状态机设计**：使用 `GenerationStep` 枚举（`SETUP` -> `CHARACTERS` -> `PLOT` -> `WRITING`）严格控制 UI 渲染和数据流转。
- **自动保存逻辑**：监听核心状态变化，实时序列化写入 `localStorage`。
  ```javascript
  useEffect(() => {
    if (!isLoadedFromStorage) return;
    const data = { version: 1, step, prompt, world, characters, plot, chapters, storySummary, ... };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [step, prompt, world, characters, plot, chapters, storySummary, ...]);
  ```
- **批量生成与流式处理**：
  - 细纲生成：一次性生成 N 章细纲（JSON 数组）。
  - 正文生成：支持单章流式生成（SSE / AsyncGenerator）以提升用户体验，也支持后台批量非流式生成。

## 6. 跨技术栈复现方案
### 6.1 技术替代映射
| 原技术 | 替代技术选项 | 迁移注意事项 |
|--------|-------------|-------------|
| 纯前端直连 API | Node.js / Python FastAPI 后端 | 当前架构将 API Key 暴露在客户端（通过环境变量注入前端），存在极大的安全风险。生产环境**必须**迁移到后端代理调用，由后端持有 API Key。 |
| React SPA | Next.js / Nuxt.js | 如果需要更好的路由管理或服务端渲染，可迁移至全栈框架，利用 API Routes 处理大模型请求。 |
| LocalStorage | IndexedDB / 数据库 (PostgreSQL) | 随着小说章节增多，LocalStorage (5MB限制) 极易爆满。前端建议改用 IndexedDB (如 Dexie.js)，或直接存入云端数据库。 |
| Gemini / Qwen | DeepSeek-V3 / Claude 3.5 Sonnet | DeepSeek 在网文生成上性价比极高，且 API 兼容 OpenAI 格式，只需替换 BaseURL 和 SDK 即可无缝迁移。 |

## 7. 风险与限制
1. **安全风险（致命）**：API Key 在前端代码中直接使用，极易被逆向窃取。
2. **存储限制**：`localStorage` 容量有限，长篇小说（几十万字）会导致保存失败和数据丢失。
3. **上下文截断与幻觉**：虽然有 `compressStoryHistory` 缓解，但随着字数达到百万级别，1000字的摘要可能无法覆盖所有伏笔，导致后期剧情崩盘（网文常见的“战力崩坏”或“吃书”）。
4. **JSON 解析脆弱性**：依赖 LLM 输出严格的 JSON，如果模型输出包含 Markdown 标记或格式错误，会导致流程中断（代码中已有简单的正则清理，但仍需更健壮的容错机制，如 JSON 修复库）。
