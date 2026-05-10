import type { LlmProviderConfig } from "./llmConfig";
import { createChatCompletionJsonStream } from "./openaiChat";
import type { LearningSessionPackage } from "./sessionPackage";
import type {
  ChatMessage,
  LearningQuestion,
  LearningSession,
  PageContext,
  PageSummary
} from "../types/learning";
import type { LearningEvent } from "../types/learning";

type AddMessage = (role: ChatMessage["role"], content: string, thinking?: string) => void;

type TutorRuntimeDependencies = {
  getLlmConfig: () => LlmProviderConfig;
  getSessionPackage: () => LearningSessionPackage;
  getSession: () => LearningSession;
  getCurrentPageTitle: () => string | undefined;
  addMessage: AddMessage;
  appendAssistant: (content: string) => void;
  replaceLastStreamingAssistant: (content: string) => void;
  dispatch: (event: LearningEvent) => void;
  schedule: (callback: () => void, delay: number) => void;
  setStreamRunning: (value: boolean) => void;
};

type LlmExplanationPayload = {
  explanation: string;
  question: {
    prompt: string;
    options: Array<{ id: string; text: string }>;
    correctOptionIds: string[];
    expectedFocus: string[];
    explanation?: string;
  };
};

type LlmEvaluationPayload = {
  feedback: string;
  isCorrect: boolean;
  score?: number;
  missingConcepts: string[];
};

type LlmSummaryPayload = {
  title: string;
  summary: string;
  keyPoints: string[];
};

export function createTutorRuntime(deps: TutorRuntimeDependencies) {
  async function startRealExplanation(context: PageContext) {
    const llmConfig = deps.getLlmConfig();
    deps.setStreamRunning(true);
    deps.addMessage("system", `使用 ${llmConfig.model} 讲解第 ${context.pageNumber} 页。`);

    try {
      const payload = await createChatCompletionJsonStream<LlmExplanationPayload>(
        llmConfig,
        [
          {
            role: "system",
            content:
              "你是 VibeLearning 的主动学习 tutor。请基于当前学习单元讲解，并出一道单选题。只输出 JSON。"
          },
          {
            role: "user",
            content: [
              `会话上下文包: ${JSON.stringify(deps.getSessionPackage())}`,
              `当前文档: ${context.documentId}`,
              `当前页码: ${context.pageNumber}`,
              `当前页图片引用: ${context.pageImage.dataRef}`,
              `当前页可选文本: ${context.extractedText ?? "无"}`,
              `上一页总结: ${context.previousPageSummary ?? "无"}`,
              "JSON schema:",
              "{",
              '  "explanation": "中文讲解，控制在 300 字以内",',
              '  "question": {',
              '    "prompt": "单选题题干",',
              '    "options": [{"id":"a","text":"..."},{"id":"b","text":"..."},{"id":"c","text":"..."},{"id":"d","text":"..."}],',
              '    "correctOptionIds": ["a"],',
              '    "expectedFocus": ["..."],',
              '    "explanation": "答案解释"',
              "  }",
              "}"
            ].join("\n")
          }
        ],
        deps.appendAssistant
      );

      deps.replaceLastStreamingAssistant(payload.explanation);
      const question: LearningQuestion = {
        id: `q-${context.pageNumber}-${Date.now()}`,
        answerKind: "single_choice",
        prompt: payload.question.prompt,
        options: payload.question.options,
        correctOptionIds: payload.question.correctOptionIds,
        expectedFocus: payload.question.expectedFocus,
        explanation: payload.question.explanation,
        difficulty: "medium",
        source: {
          documentId: context.documentId,
          pageNumber: context.pageNumber
        }
      };
      deps.setStreamRunning(false);
      deps.dispatch({ type: "LLM_ASKS_QUESTION", question });
      deps.dispatch({ type: "QUESTION_RENDERED", questionId: question.id });
    } catch (error) {
      deps.setStreamRunning(false);
      deps.dispatch({
        type: "LLM_ERROR",
        error: error instanceof Error ? error.message : "LLM explanation failed."
      });
      deps.addMessage(
        "system",
        "真实 LLM 调用失败，检查 API key、base URL、模型名或浏览器 CORS。"
      );
    }
  }

  async function startRealEvaluation(questionId: string, answer: string) {
    const llmConfig = deps.getLlmConfig();
    deps.setStreamRunning(true);

    try {
      const payload = await createChatCompletionJsonStream<LlmEvaluationPayload>(
        llmConfig,
        [
          {
            role: "system",
            content: "你是 VibeLearning 的答案评价器。请评价用户答案，只输出 JSON。"
          },
          {
            role: "user",
            content: JSON.stringify({
              question: deps.getSession().currentQuestion,
              userAnswer: answer,
              sessionPackage: deps.getSessionPackage(),
              schema: {
                feedback: "中文反馈",
                isCorrect: true,
                score: 0.8,
                missingConcepts: ["缺失概念"]
              }
            })
          }
        ],
        deps.appendAssistant
      );

      deps.replaceLastStreamingAssistant(payload.feedback);
      deps.setStreamRunning(false);
      deps.dispatch({
        type: "LLM_EVALUATES_ANSWER",
        evaluation: {
          questionId,
          feedback: payload.feedback,
          isCorrect: payload.isCorrect,
          score: payload.score,
          missingConcepts: payload.missingConcepts
        }
      });
    } catch (error) {
      deps.setStreamRunning(false);
      deps.dispatch({
        type: "LLM_ERROR",
        error: error instanceof Error ? error.message : "LLM evaluation failed."
      });
    }
  }

  async function startRealUserQuestionAnswer(message: string) {
    const llmConfig = deps.getLlmConfig();
    deps.setStreamRunning(true);

    try {
      const payload = await createChatCompletionJsonStream<{ answer: string }>(
        llmConfig,
        [
          {
            role: "system",
            content:
              "你是 VibeLearning 的 tutor。回答用户打断问题，然后提醒可以回到原学习流程。只输出 JSON。"
          },
          {
            role: "user",
            content: JSON.stringify({
              currentState: deps.getSession().state,
              currentQuestion: deps.getSession().currentQuestion,
              sessionPackage: deps.getSessionPackage(),
              userQuestion: message,
              schema: { answer: "中文回答" }
            })
          }
        ],
        deps.appendAssistant
      );

      deps.replaceLastStreamingAssistant(payload.answer);
      deps.setStreamRunning(false);
      deps.dispatch({ type: "LLM_FINISHES_USER_ANSWER" });
    } catch (error) {
      deps.setStreamRunning(false);
      deps.dispatch({
        type: "LLM_ERROR",
        error: error instanceof Error ? error.message : "LLM answer failed."
      });
    }
  }

  async function startRealSummary() {
    const llmConfig = deps.getLlmConfig();
    deps.setStreamRunning(true);

    try {
      const payload = await createChatCompletionJsonStream<LlmSummaryPayload>(
        llmConfig,
        [
          {
            role: "system",
            content: "你是 VibeLearning 的学习记录器。总结当前页面学习结果，只输出 JSON。"
          },
          {
            role: "user",
            content: JSON.stringify({
              pageNumber: deps.getSession().pageNumber,
              currentQuestion: deps.getSession().currentQuestion,
              sessionPackage: deps.getSessionPackage(),
              schema: {
                title: "标题",
                summary: "总结",
                keyPoints: ["关键点"]
              }
            })
          }
        ],
        deps.appendAssistant
      );

      const currentQuestion = deps.getSession().currentQuestion;
      deps.replaceLastStreamingAssistant(payload.summary);
      deps.setStreamRunning(false);
      deps.dispatch({
        type: "LLM_SUMMARIZES_PAGE",
        summary: {
          title: payload.title,
          summary: payload.summary,
          keyPoints: payload.keyPoints,
          formulas: [],
          questions: currentQuestion ? [currentQuestion] : [],
          mistakes: []
        }
      });
    } catch (error) {
      deps.setStreamRunning(false);
      deps.dispatch({
        type: "LLM_ERROR",
        error: error instanceof Error ? error.message : "LLM summary failed."
      });
    }
  }

  function startMockExplanation(context: PageContext) {
    deps.setStreamRunning(true);
    deps.appendAssistant(
      `<thinking>识别当前页面编号，先建立学习目标，再用单选题检查主线。</thinking>我看到了第 ${context.pageNumber} 页。`
    );
    deps.schedule(
      () =>
        deps.appendAssistant(
          " 先抓主线：这页通常包含一个定义、一个动机，以及一个需要你主动检查的细节。"
        ),
      500
    );
    deps.schedule(
      () => deps.appendAssistant(" 我会先讲图和公式之间的关系，然后问你一个小问题。"),
      1050
    );
    deps.schedule(() => {
      deps.setStreamRunning(false);
      const question: LearningQuestion = {
        id: `q-${context.pageNumber}-${Date.now()}`,
        answerKind: "single_choice",
        prompt: "如果只看这一页，作者最想让读者掌握的关系是什么？",
        options: [
          { id: "a", text: "概念、图示和例子之间如何互相支撑" },
          { id: "b", text: "所有术语的完整历史来源" },
          { id: "c", text: "排版风格和页面颜色的选择" },
          { id: "d", text: "下一章会出现的全部结论" }
        ],
        correctOptionIds: ["a"],
        expectedFocus: ["定义", "公式含义", "图表关系"],
        difficulty: "medium",
        explanation: "这类页面通常要先抓概念和视觉证据之间的连接。",
        source: {
          documentId: context.documentId,
          pageNumber: context.pageNumber,
          regionHint: "页面中部的图示与其前后的说明"
        }
      };
      deps.dispatch({ type: "LLM_ASKS_QUESTION", question });
      deps.dispatch({ type: "QUESTION_RENDERED", questionId: question.id });
    }, 1650);
  }

  function startMockEvaluation(questionId: string, answer: string) {
    deps.setStreamRunning(true);
    deps.appendAssistant("我来评价一下你的回答。");
    deps.schedule(() => {
      const isChoiceCorrect =
        deps.getSession().currentQuestion?.correctOptionIds?.join(",") === answer;
      deps.appendAssistant(
        isChoiceCorrect || answer.length > 18
          ? " 方向是对的，重点就是抓住概念、图示和例子之间的支撑关系。"
          : " 这次不太对。我会先补上关键连接：概念不是孤立出现的，它服务于后面的公式或图示。"
      );
    }, 550);
    deps.schedule(() => {
      const isChoiceCorrect =
        deps.getSession().currentQuestion?.correctOptionIds?.join(",") === answer;
      deps.setStreamRunning(false);
      deps.dispatch({
        type: "LLM_EVALUATES_ANSWER",
        evaluation: {
          questionId,
          feedback: "Mock evaluation complete.",
          isCorrect: isChoiceCorrect || answer.length > 18,
          score: isChoiceCorrect || answer.length > 18 ? 0.82 : 0.48,
          missingConcepts:
            isChoiceCorrect || answer.length > 18
              ? []
              : ["页面主线", "概念到例子的连接"]
        }
      });
    }, 1050);
  }

  function startMockUserQuestionAnswer(message: string) {
    deps.setStreamRunning(true);
    deps.appendAssistant(`先处理你的问题：“${message}”。`);
    deps.schedule(
      () => deps.appendAssistant(" 简短说，它和当前页的主线有关，但不需要打断整个学习节奏。"),
      520
    );
    deps.schedule(() => deps.appendAssistant(" 我会把这个点折回原来的讲解位置。"), 980);
    deps.schedule(() => {
      deps.setStreamRunning(false);
      deps.dispatch({ type: "LLM_FINISHES_USER_ANSWER" });
    }, 1260);
  }

  function startMockSummary() {
    deps.setStreamRunning(true);
    deps.appendAssistant("这一页可以收束成三点：");
    deps.schedule(
      () =>
        deps.appendAssistant(
          " 第一，先识别核心概念；第二，看它如何落到公式或图；第三，用一个问题检查自己是否真的懂了。"
        ),
      580
    );
    deps.schedule(() => {
      deps.setStreamRunning(false);
      const currentQuestion = deps.getSession().currentQuestion;
      const summary: PageSummary = {
        title: deps.getCurrentPageTitle() ?? "页面总结",
        summary: "本页完成了一轮讲解、提问和回答评价。",
        keyPoints: ["核心概念", "图文关系", "主动回忆"],
        formulas: [],
        questions: currentQuestion ? [currentQuestion] : [],
        mistakes: []
      };
      deps.dispatch({ type: "LLM_SUMMARIZES_PAGE", summary });
    }, 1120);
  }

  return {
    startMockEvaluation,
    startMockExplanation,
    startMockSummary,
    startMockUserQuestionAnswer,
    startRealEvaluation,
    startRealExplanation,
    startRealSummary,
    startRealUserQuestionAnswer
  };
}
