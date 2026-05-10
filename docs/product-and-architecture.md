# VibeLearning 产品与架构

## 产品目标

VibeLearning 是一个 keyboard-first 的桌面自学工具，用多模态 LLM 把 PDF、课件截图、代码片段和学习记录组织成完整学习闭环。

主界面分成两栏：

- 右侧：PDF 阅读器。
- 左侧：LLM 学习会话。

用户选择 PDF 的某一页后，应用将该页渲染成图片并发送给多模态 LLM。LLM 不只是被动回答问题，而是主动带用户学习：讲解、提问、评价回答，并在页面结束时做小结和测试。

产品定位不是普通 PDF chat，也不是课堂辅助笔记，而是 active learning loop for lecture materials。

它要解决的核心痛点是：用户在课件、代码编辑器、笔记应用和 LLM 之间来回切换时，上下文容易丢失，当前页、当前代码和当前问题对不上，学习记录也分散。

长期目标是尽量去掉对老师讲解节奏的依赖：应用自己负责把学习材料粘合起来，形成可执行的学习路径。

对前端课、编程课这类动手课程，单纯看老师上下翻动编辑器并不能形成能力。产品必须把“看懂”推进到“能做”：先讲清楚，再出题，再让用户局部写代码或解释代码。

## 与 NotebookLM 的区别

VibeLearning 不做 NotebookLM 式的资料库问答。

NotebookLM 的核心体验是：用户上传资料，系统围绕资料提供问答、摘要、学习指南、flashcards 或 quiz。它的默认姿态是 source-grounded knowledge workspace。

VibeLearning 的核心体验是：用户进入当前学习单元，系统主动组织学习节奏，带用户完成讲解、提问、回答、评价、代码练习和总结。它的默认姿态是 page-aware active tutor。

关键区别：

- NotebookLM 以资料库为中心；VibeLearning 以当前学习单元为中心。
- NotebookLM 倾向回答用户问题；VibeLearning 要主动推进学习流程。
- NotebookLM 适合资料整理；VibeLearning 适合替代低质量课堂讲解，形成自学闭环。
- NotebookLM 的 quiz 更像生成学习资产；VibeLearning 的题目是状态机中的下一步动作。
- NotebookLM 关心跨资料检索；VibeLearning 关心当前页、当前代码、当前练习是否真的学会。

## 不做 RAG

VibeLearning 第一性原则：不做 RAG，不做长期资料库检索，不把产品变成“上传一堆资料然后问问题”。

原因：

- 目标材料是小课件和短代码上下文，1M 级上下文窗口足够直接放入完整或近完整材料。
- 既然可以直接给模型完整上下文，就不需要额外引入 chunking、embedding、召回和重排工作流。
- RAG 会把产品重心拉向资料检索，而不是学习节奏。
- RAG 会鼓励用户提问，但本产品要让系统主动提问。
- RAG 会引入 chunking、embedding、召回、重排和引用管理等复杂度，稀释第一版核心体验。
- RAG 很容易让产品变成另一个 NotebookLM。
- 当前页截图、多模态理解和短期学习状态已经足够支撑第一版。

允许的上下文是学习闭环所需的直接上下文：

- 当前小课件的完整或近完整内容。
- 当前 PDF 页图片。
- 当前页可选文本抽取。
- 当前代码片段。
- 当前课堂截图。
- 上一页或当前学习单元总结。
- 用户在本学习单元内的回答、错题和打断问题。

禁止的方向：

- 全文档向量索引。
- 多文档知识库。
- 自动跨资料召回。
- 将历史所有笔记作为默认检索上下文。
- 以“问资料库”为主界面。

如果上下文超出模型窗口，优先做显式压缩和学习单元切分，而不是引入 RAG。

第一阶段先做桌面端，不做平板适配。但长期产品形态必须保留对课件阅读流、触控和手写笔工作流的想象空间。

## 第一版目标

第一版先做出最小但完整的学习闭环：

1. 打开 PDF。
2. 在右侧渲染 PDF 页面。
3. 用户选择某一页。
4. 将该页渲染为图片。
5. 在左侧启动学习会话。
6. 流式输出 LLM 讲解。
7. 支持用户随时中断。
8. 页面学习过程中至少抛出一个问题。
9. 评价用户回答。
10. 生成页面总结和学习记录。

## 学习闭环

每个学习单元都应尽量走完这个闭环：

1. 识别当前材料：PDF 页、课件截图、代码片段或它们的组合。
2. 提炼本单元应该掌握的目标。
3. 用多模态 LLM 讲解材料。
4. 用选择题检查用户是否抓住主线。
5. 对动手课加入代码阅读题或局部补全题。
6. 允许用户随时打断提问。
7. 回到原学习流程。
8. 生成总结、错题和后续复习材料。

第一版以 PDF 页作为学习单元。后续应支持代码片段和课堂截图作为一等学习源。

## 会话机制

VibeLearning 使用显式学习会话，而不是长期资料库。

一个会话代表一次完整学习上下文包。同一个会话内，每次 LLM 调用都应带上完整 session package，而不是通过 RAG 检索片段。

会话包含：

- `sessionId`
- `sessionName`
- 当前文档信息
- 当前学习单元
- 当前状态机状态
- 本会话内页面学习记录
- 最近对话
- 当前题目
- 产品约束，例如不做 RAG、选择题优先、不要求用户输入 LaTeX/Typst

用户可以：

- 新建会话
- 命名/重命名会话
- 在同一 PDF 上重新开始一个干净上下文

新建会话时：

- 保留当前 PDF。
- 清空消息、状态机、题目和本会话学习记录。
- 后续 LLM 请求使用新的 session package。

第一版使用 IndexedDB 持久化会话。

持久化内容包括：

- 会话名和会话 id。
- 当前文档标题和页数。
- 当前学习状态。
- 本会话消息。
- 页面学习记录。
- PDF 页面渲染结果。
- 用于简单搜索的 `searchableText`。

搜索第一版采用本地字符串匹配，不引入 RAG、向量索引或全文搜索服务。

## 第一版暂不做

- 完整 PDF 语义解析。
- 完整 OCR 流水线。
- LaTeX 编辑。
- 在聊天消息里实时渲染 Typst。
- 让 LLM 自由生成完整 Typst 文档。
- 完整代码执行沙箱。
- 让 LLM 为代码题自由生成项目文件和测试工程。
- 复杂间隔复习。
- 多文档知识库。

## 学习源策略

第一版将 PDF 页面渲染图作为主要输入。

发送给 LLM 的上下文应包含：

- 当前页图片。
- 页码。
- 文档标题或文件名。
- 可选的页面文本抽取结果。
- 可选的上一页学习总结。
- 当前学习状态。

这样可以避免 PDF 文本抽取成为第一版阻塞点，同时天然支持扫描版、图表、公式、表格和复杂版式。

长期学习源不应只限于 PDF：

```ts
type LearningSource =
  | {
      type: "pdf_page";
      documentId: string;
      pageNumber: number;
      regionHint?: string;
    }
  | {
      type: "code_snippet";
      fileName?: string;
      language: string;
      code: string;
      lineRange?: [number, number];
    }
  | {
      type: "lecture_snapshot";
      imageRef: string;
      note?: string;
    };
```

这些源可以组合成一个学习单元。例如：一页课件 + 一段代码 + 用户笔记。

## LLM 交互策略

LLM 应该表现为主动 tutor，而不是普通聊天机器人。

它需要：

- 分段讲解当前页。
- 在合适位置提出问题。
- 等待用户回答。
- 评价用户回答。
- 根据用户困惑或错误调整讲解。
- 页面学习结束后生成总结。

应用不应该只靠自然语言判断 LLM 正在做什么。LLM 应输出结构化 intent，由 intent 驱动学习状态机。

## LLM 配置存储

纯前端阶段支持 OpenAI-compatible Chat Completions。

用户自行配置：

- Base URL，默认 `https://api.openai.com/v1`
- Model
- API Key
- 是否启用真实 LLM

第一版配置存储在浏览器 `localStorage`。这是为了快速验证产品闭环，不是最终安全方案。

注意事项：

- 纯前端直连会把 API key 暴露给当前浏览器环境。
- 如果 OpenAI 或兼容服务不允许浏览器 CORS，需要用户配置兼容代理，或后续接 Tauri 本地层。
- 如果未来打包为 Tauri，应迁移到系统 keychain、本地加密存储或 Rust 后端托管请求。
- 学习状态机和 UI 不依赖具体供应商，只依赖 OpenAI-compatible `/chat/completions` 响应。

## 代码题策略

代码题是长期必须支持的能力，但不能一开始就做成自由编码 agent。

核心风险是：很多代码题只需要用户补一小段，但为了验证这一小段，系统可能被迫让 LLM 生成一堆文件、依赖、测试用例和运行环境。这会让实现快速变成难维护的复杂 agent 流程。

因此代码题要分层：

- `code_reading`：读代码题，不执行代码。可以用选择题、多选题或简答题承载。
- `code_completion`：局部补全题，只允许用户编辑一小段代码。
- `code_writing`：完整代码题，需要运行测试，放到后续高级能力。

验证也要分层：

- `none`：不验证，只作为阅读理解题。
- `llm_review`：LLM 根据题目、rubric 和上下文评价用户答案，不运行代码。
- `snippet_tests`：只执行独立片段，例如纯函数。
- `project_tests`：生成或使用项目级测试，后续再做。

第一版只允许 `code_reading` 和少量 `code_completion`，验证方式以 `llm_review` 为主。`project_tests` 明确不是第一版目标。

对前端学习，代码题尤其重要。用户不能只看编辑器滚动，而要在学习系统里完成这些动作：

- 读懂一段 HTML/CSS/TypeScript/Vue 代码的作用。
- 判断某段代码会产生什么 UI 或行为。
- 选择正确的事件处理、状态更新或组件拆分方式。
- 补全一小段代码。
- 根据错误现象选择最可能的 bug 原因。

代码题必须带明确的用户可编辑区域，避免用户和 LLM 都进入无限开放的项目修改空间。

```ts
type CodeVerificationMode =
  | "none"
  | "llm_review"
  | "snippet_tests"
  | "project_tests";

type CodeQuestion = {
  id: string;
  answerKind: "code_reading" | "code_completion" | "code_writing";
  prompt: string;
  language: "python" | "javascript" | "typescript" | "rust";
  starterCode: string;
  userEditRegion?: {
    startMarker: string;
    endMarker: string;
  };
  verificationMode: CodeVerificationMode;
  rubric: Array<{
    criterion: string;
    required: boolean;
  }>;
  tests?: Array<{
    input: string;
    expectedOutput: string;
    hidden: boolean;
  }>;
};
```

## Typst 策略

Typst 用于稳定、持久的学习产物：

- 页面笔记。
- 页面总结。
- 错题回顾。
- 测试题。
- 导出的学习报告。

Typst 不进入实时聊天主链路。

LLM 输出结构化学习数据，应用通过固定 Typst 模板生成文档。

示例结构化笔记：

```json
{
  "title": "Gradient Descent",
  "summary": "This page introduces the gradient descent update rule.",
  "key_points": [
    "Gradient descent updates parameters in the opposite direction of the gradient.",
    "The learning rate controls step size."
  ],
  "formulas": [
    {
      "label": "Update rule",
      "body": "theta_(t+1) = theta_t - eta grad L(theta_t)"
    }
  ],
  "questions": [
    {
      "question": "What happens if the learning rate is too large?",
      "expected_focus": ["overshooting", "instability"]
    }
  ],
  "mistakes": []
}
```

应用再用受控模板把这些数据渲染为 Typst，避免 LLM 随意写出不可编译的 Typst 文档。

## 前端职责

Vue 前端负责：

- PDF 阅读器布局。
- 页面选择。
- 聊天界面。
- 流式消息渲染。
- 键盘模式。
- 本地 UI 状态。
- 向学习状态机派发用户事件。

## Rust 后端职责

Rust 后端负责：

- 通过 Tauri command 访问文件。
- PDF 页面渲染，如果选择在原生侧实现。
- LLM API 调用。
- 流式输出与取消生成的桥接。
- 持久化学习记录。
- Typst 生成和编译，如果本地可用。

## 键盘体验

左侧交互应是 Vim-inspired，而不是完整 Vim clone。

初始模式：

- Normal mode：导航消息、页面和命令。
- Insert mode：输入用户消息或答案。
- Command mode：执行跳页、导出等命令。

初始快捷键：

- `Esc`：回到 normal mode，或退出当前输入焦点。
- `i`：进入 insert mode。
- `Enter`：发送消息或答案。
- `Ctrl+C`：中断 LLM 生成。
- `j` / `k`：移动消息选择。
- `]` / `[`：下一页或上一页。
- `/`：搜索消息或笔记。
- `:`：打开命令模式。

## 数据模型草案

```ts
type PageLearningRecord = {
  documentId: string;
  pageNumber: number;
  status: "not_started" | "in_progress" | "completed";
  summary?: string;
  keyPoints: string[];
  questions: LearningQuestion[];
  mistakes: LearningMistake[];
  updatedAt: string;
};

type LearningQuestion = {
  id: string;
  answerKind: "single_choice" | "multiple_choice" | "cloze" | "short_answer";
  prompt: string;
  options?: Array<{
    id: string;
    text: string;
  }>;
  correctOptionIds?: string[];
  expectedFocus: string[];
  explanation?: string;
  userAnswer?: string;
  feedback?: string;
  score?: number;
};

type LearningMistake = {
  id: string;
  sourceQuestionId?: string;
  description: string;
  correction: string;
};
```

## 建议实现顺序

1. 应用壳和左右分栏布局。
2. PDF 打开与页面渲染。
3. 页面选择事件。
4. LLM 流式聊天。
5. 学习状态机。
6. 中断与恢复。
7. 结构化学习记录。
8. 基于模板生成 Typst 笔记。
