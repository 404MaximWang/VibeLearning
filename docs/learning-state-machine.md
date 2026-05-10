# 学习状态机

## 目标

学习状态机用于协调用户选择 PDF 页面之后的 tutor 流程。

它需要明确：

- 用户当前能做什么。
- LLM 当前允许做什么。
- 用户中断时如何处理。
- 页面何时算完成学习。
- 什么时机写入学习记录。

## 核心状态

```ts
type LearningState =
  | "idle"
  | "page_selected"
  | "preparing_context"
  | "explaining"
  | "questioning"
  | "awaiting_answer"
  | "evaluating_answer"
  | "interrupted"
  | "answering_user_question"
  | "resuming_lesson"
  | "summarizing_page"
  | "page_completed"
  | "error";
```

## 状态说明

### idle

没有活跃的页面学习会话。

允许事件：

- `SELECT_PAGE`
- `OPEN_DOCUMENT`

### page_selected

用户已经选择 PDF 页面。应用知道文档 id 和页码，但 LLM 尚未开始。

允许事件：

- `PREPARE_CONTEXT`
- `SELECT_PAGE`
- `CANCEL`

### preparing_context

应用准备 LLM 输入：

- 当前页渲染图。
- 可选的页面文本抽取结果。
- 上一页总结。
- 已存在的页面学习记录。

允许事件：

- `CONTEXT_READY`
- `CONTEXT_FAILED`
- `SELECT_PAGE`
- `CANCEL`

### explaining

LLM 正在讲解当前页面。

允许事件：

- `LLM_ASKS_QUESTION`
- `LLM_FINISHES_EXPLANATION`
- `USER_INTERRUPTS`
- `USER_MESSAGE`
- `LLM_ERROR`
- `CANCEL`

### questioning

LLM 已生成问题。应用展示问题后，应进入等待用户回答状态。

允许事件：

- `QUESTION_RENDERED`
- `USER_INTERRUPTS`
- `CANCEL`

### awaiting_answer

应用正在等待用户回答 tutor 的问题。

允许事件：

- `USER_ANSWER`
- `USER_ASKS_CLARIFICATION`
- `USER_INTERRUPTS`
- `SKIP_QUESTION`
- `CANCEL`

### evaluating_answer

LLM 正在评价用户答案。

允许事件：

- `LLM_EVALUATES_ANSWER`
- `USER_INTERRUPTS`
- `LLM_ERROR`
- `CANCEL`

### interrupted

用户中断了当前 tutor 流程。

应用需要保留：

- 上一个状态。
- 当前文档和页码。
- 当前问题，如果有。
- LLM 已经输出的部分内容，如果有价值。

允许事件：

- `USER_MESSAGE`
- `RESUME`
- `CANCEL`
- `SELECT_PAGE`

### answering_user_question

LLM 正在回答用户中断后提出的问题。

允许事件：

- `LLM_FINISHES_USER_ANSWER`
- `USER_INTERRUPTS`
- `USER_MESSAGE`
- `LLM_ERROR`
- `CANCEL`

### resuming_lesson

应用从中断问答回到原本的 tutor 流程。

允许事件：

- `RESUME_TO_EXPLANATION`
- `RESUME_TO_AWAITING_ANSWER`
- `RESUME_TO_SUMMARY`
- `CANCEL`

### summarizing_page

LLM 正在生成页面总结、关键知识点、问题和错误记录。

允许事件：

- `LLM_SUMMARIZES_PAGE`
- `USER_INTERRUPTS`
- `LLM_ERROR`
- `CANCEL`

### page_completed

当前页面学习流程完成。

允许事件：

- `SELECT_PAGE`
- `REVIEW_PAGE`
- `EXPORT_NOTES`

### error

发生错误。

允许事件：

- `RETRY`
- `CANCEL`
- `SELECT_PAGE`

## 事件定义

```ts
type LearningEvent =
  | { type: "OPEN_DOCUMENT"; documentId: string }
  | { type: "SELECT_PAGE"; documentId: string; pageNumber: number }
  | { type: "PREPARE_CONTEXT" }
  | { type: "CONTEXT_READY"; context: PageContext }
  | { type: "CONTEXT_FAILED"; error: string }
  | { type: "LLM_ASKS_QUESTION"; question: LearningQuestion }
  | { type: "QUESTION_RENDERED"; questionId: string }
  | { type: "USER_ANSWER"; questionId: string; answer: string }
  | { type: "USER_ASKS_CLARIFICATION"; message: string }
  | { type: "USER_INTERRUPTS"; message?: string }
  | { type: "USER_MESSAGE"; message: string }
  | { type: "LLM_EVALUATES_ANSWER"; evaluation: AnswerEvaluation }
  | { type: "LLM_FINISHES_EXPLANATION" }
  | { type: "LLM_FINISHES_USER_ANSWER" }
  | { type: "LLM_SUMMARIZES_PAGE"; summary: PageSummary }
  | { type: "RESUME" }
  | { type: "RESUME_TO_EXPLANATION" }
  | { type: "RESUME_TO_AWAITING_ANSWER"; questionId: string }
  | { type: "RESUME_TO_SUMMARY" }
  | { type: "SKIP_QUESTION"; questionId: string }
  | { type: "REVIEW_PAGE"; pageNumber: number }
  | { type: "EXPORT_NOTES"; pageNumber?: number }
  | { type: "LLM_ERROR"; error: string }
  | { type: "RETRY" }
  | { type: "CANCEL" };
```

## 上下文类型

```ts
type PageContext = {
  documentId: string;
  pageNumber: number;
  sources?: LearningSource[];
  pageImage: {
    mimeType: "image/png" | "image/jpeg";
    dataRef: string;
  };
  extractedText?: string;
  previousPageSummary?: string;
  existingRecord?: PageLearningRecord;
};

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

type QuestionAnswerKind =
  | "single_choice"
  | "multiple_choice"
  | "cloze"
  | "short_answer"
  | "code_reading"
  | "code_completion"
  | "code_writing";

type QuestionOption = {
  id: string;
  text: string;
};

type LearningQuestion = {
  id: string;
  answerKind: QuestionAnswerKind;
  prompt: string;
  difficulty: "easy" | "medium" | "hard";
  options?: QuestionOption[];
  correctOptionIds?: string[];
  blanks?: Array<{
    id: string;
    label: string;
    acceptedAnswers: string[];
  }>;
  expectedPlainTextAnswer?: string;
  expectedFocus: string[];
  explanation?: string;
  source: {
    documentId: string;
    pageNumber: number;
    regionHint?: string;
  };
  code?: CodeQuestionPayload;
};

type CodeVerificationMode =
  | "none"
  | "llm_review"
  | "snippet_tests"
  | "project_tests";

type CodeQuestionPayload = {
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

type AnswerEvaluation = {
  questionId: string;
  feedback: string;
  isCorrect: boolean;
  score?: number;
  missingConcepts: string[];
  followUpQuestion?: LearningQuestion;
};

type PageSummary = {
  title: string;
  summary: string;
  keyPoints: string[];
  formulas: Array<{
    label: string;
    body: string;
  }>;
  questions: LearningQuestion[];
  mistakes: Array<{
    description: string;
    correction: string;
    sourceQuestionId?: string;
  }>;
};
```

## 出题字段原则

题目按用户回答形式分类，而不是按知识类型分类。

第一版支持四种回答形式：

- `single_choice`：单选题，第一版主力题型。
- `multiple_choice`：多选题，用于检查多个并列概念。
- `cloze`：填空题，只接受短文本，不要求用户输入 LaTeX 或 Typst。
- `short_answer`：简答题，用于少量开放解释，也只接受纯文本。

长期需要支持三种代码题：

- `code_reading`：代码阅读题，不执行代码，优先用选择题体验承载。
- `code_completion`：代码补全题，只允许用户改一小段。
- `code_writing`：完整代码题，需要运行测试，属于后续高级能力。

第一版出题比例建议：

- 单选题：70% 到 80%。
- 多选题：10% 到 20%。
- 填空题：少量使用。
- 简答题：只在确实需要用户组织语言时使用。

用户永远不需要手写 LaTeX 或 Typst。涉及公式时，题目应该转成选择、判断关系、填关键词或解释含义。

代码题默认不进入项目级验证。第一版只允许 `llm_review`，后续可以增加 `snippet_tests`。`project_tests` 必须显式开启，不能由 LLM 自行决定。

## 转换表

| 当前状态 | 事件 | 下一个状态 | 动作 |
| --- | --- | --- | --- |
| `idle` | `SELECT_PAGE` | `page_selected` | 保存文档和页码。 |
| `page_selected` | `PREPARE_CONTEXT` | `preparing_context` | 渲染页面图片，加载可选文本和学习记录。 |
| `preparing_context` | `CONTEXT_READY` | `explaining` | 启动 tutor 讲解流。 |
| `preparing_context` | `CONTEXT_FAILED` | `error` | 保存错误。 |
| `explaining` | `LLM_ASKS_QUESTION` | `questioning` | 保存问题。 |
| `questioning` | `QUESTION_RENDERED` | `awaiting_answer` | 聚焦答案输入。 |
| `awaiting_answer` | `USER_ANSWER` | `evaluating_answer` | 启动答案评价流。 |
| `evaluating_answer` | `LLM_EVALUATES_ANSWER` | `explaining` | 保存评价并继续讲解。 |
| `evaluating_answer` | `LLM_EVALUATES_ANSWER` 且有追问 | `questioning` | 保存追问。 |
| `explaining` | `LLM_FINISHES_EXPLANATION` | `summarizing_page` | 启动页面总结流。 |
| `summarizing_page` | `LLM_SUMMARIZES_PAGE` | `page_completed` | 保存页面学习记录。 |
| 任意活跃 LLM 状态 | `USER_INTERRUPTS` | `interrupted` | 取消当前流，保存恢复目标。 |
| `interrupted` | `USER_MESSAGE` | `answering_user_question` | 启动用户问题回答流。 |
| `answering_user_question` | `LLM_FINISHES_USER_ANSWER` | `resuming_lesson` | 准备恢复原 tutor 流程。 |
| `resuming_lesson` | `RESUME_TO_EXPLANATION` | `explaining` | 继续讲解。 |
| `resuming_lesson` | `RESUME_TO_AWAITING_ANSWER` | `awaiting_answer` | 恢复当前问题。 |
| `resuming_lesson` | `RESUME_TO_SUMMARY` | `summarizing_page` | 继续页面总结。 |
| 任意状态 | `SELECT_PAGE` | `page_selected` | 切换到新页面学习会话。 |
| 任意状态 | `CANCEL` | `idle` | 取消活跃任务，清理临时状态。 |
| `error` | `RETRY` | 上一个可恢复状态 | 重试失败动作。 |

## 活跃 LLM 状态

这些状态可能存在正在运行的 LLM stream：

- `explaining`
- `evaluating_answer`
- `answering_user_question`
- `summarizing_page`

所有活跃 LLM 状态都必须支持取消。

## 中断规则

用户中断时：

1. 停止当前 LLM stream。
2. 将上一个状态保存为 `resumeTarget`。
3. 保存部分 assistant 输出，如果有价值。
4. 进入 `interrupted`。
5. 如果用户中断时已经带了问题，则立即进入 `answering_user_question`。

恢复目标示例：

```ts
type ResumeTarget =
  | { state: "explaining"; cursor?: string }
  | { state: "awaiting_answer"; questionId: string }
  | { state: "summarizing_page" };
```

## LLM Intent 契约

应用应该要求 LLM 在自然语言之外输出结构化 intent。

```ts
type TutorIntent =
  | {
      type: "explain";
      content: string;
      continueLesson: boolean;
    }
  | {
      type: "ask";
      question: LearningQuestion;
    }
  | {
      type: "evaluate";
      questionId: string;
      feedback: string;
      isCorrect: boolean;
      score?: number;
      missingConcepts: string[];
      followUpQuestion?: {
        answerKind: QuestionAnswerKind;
        prompt: string;
        options?: QuestionOption[];
        expectedFocus: string[];
      };
    }
  | {
      type: "summarize_page";
      summary: PageSummary;
    }
  | {
      type: "wait_user";
      reason: "answer_question" | "confirm_continue";
    };
```

UI 可以渲染自然语言内容，但状态机必须由结构化 intent 驱动。

## 推荐初始流程

```text
idle
  -> SELECT_PAGE
page_selected
  -> PREPARE_CONTEXT
preparing_context
  -> CONTEXT_READY
explaining
  -> LLM_ASKS_QUESTION
questioning
  -> QUESTION_RENDERED
awaiting_answer
  -> USER_ANSWER
evaluating_answer
  -> LLM_EVALUATES_ANSWER
explaining
  -> LLM_FINISHES_EXPLANATION
summarizing_page
  -> LLM_SUMMARIZES_PAGE
page_completed
```

## 最小实现形态

```ts
type LearningSession = {
  state: LearningState;
  documentId?: string;
  pageNumber?: number;
  context?: PageContext;
  currentQuestion?: LearningQuestion;
  resumeTarget?: ResumeTarget;
  recordDraft?: PageLearningRecord;
  error?: string;
};

function transition(
  session: LearningSession,
  event: LearningEvent
): LearningSession {
  switch (session.state) {
    case "idle":
      if (event.type === "SELECT_PAGE") {
        return {
          state: "page_selected",
          documentId: event.documentId,
          pageNumber: event.pageNumber
        };
      }
      return session;

    default:
      return session;
  }
}
```

实际实现时，reducer 应该保持纯函数。PDF 渲染、LLM 调用、stream 取消、学习记录持久化等副作用应放到 reducer 外部处理。

## 副作用

建议将副作用显式建模：

```ts
type LearningEffect =
  | { type: "render_page_context"; documentId: string; pageNumber: number }
  | { type: "start_llm_explanation"; context: PageContext }
  | { type: "start_llm_answer_evaluation"; questionId: string; answer: string }
  | { type: "start_llm_user_answer"; message: string }
  | { type: "start_llm_page_summary" }
  | { type: "cancel_llm_stream" }
  | { type: "save_page_record"; record: PageLearningRecord };
```

这样 UI 状态会更确定，取消生成和恢复流程也更容易推理。
