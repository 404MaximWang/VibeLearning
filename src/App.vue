<script setup lang="ts">
import { BookOpen, Bot, CheckCircle2, Circle, Loader2 } from "lucide-vue-next";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import ComposerBar from "./components/ComposerBar.vue";
import MessageList from "./components/MessageList.vue";
import PdfPane from "./components/PdfPane.vue";
import QuestionPanel from "./components/QuestionPanel.vue";
import SessionHeader from "./components/SessionHeader.vue";
import {
  defaultLlmConfig,
  hasUsableLlmConfig,
  loadLlmConfig,
  saveLlmConfig,
  type LlmProviderConfig
} from "./services/llmConfig";
import { createChatCompletionJsonStream } from "./services/openaiChat";
import { renderPdfFile } from "./services/pdfRenderer";
import { buildSessionPackage } from "./services/sessionPackage";
import {
  listStoredSessions,
  saveStoredSession,
  searchStoredSessions,
  type StoredLearningSession
} from "./services/sessionStore";
import {
  initialLearningSession,
  transition
} from "./state/learningStateMachine";
import type {
  ChatMessage,
  LearningEffect,
  LearningEvent,
  LearningQuestion,
  LearningSession,
  PageContext,
  PageLearningRecord,
  PageSummary
} from "./types/learning";
import type { PdfDocument, PdfPage } from "./types/pdf";
import { extractThinking } from "./utils/thinking";

const activeDocument = ref<PdfDocument | null>(null);
const pages = ref<PdfPage[]>([
  { pageNumber: 1, title: "概念入口", status: "not_started", accent: "mint" },
  { pageNumber: 2, title: "核心公式", status: "not_started", accent: "amber" },
  { pageNumber: 3, title: "图表解释", status: "not_started", accent: "rose" },
  { pageNumber: 4, title: "练习页", status: "not_started", accent: "blue" }
]);

const session = ref<LearningSession>({ ...initialLearningSession });
const learningSessionId = ref(`session-${Date.now()}`);
const learningSessionCreatedAt = ref(new Date().toISOString());
const learningSessionName = ref("Untitled Session");
const pageRecords = ref<PageLearningRecord[]>([]);
const messages = ref<ChatMessage[]>([
  {
    id: "welcome",
    role: "system",
    content: "选择右侧任意页面，学习状态机会启动一轮 mock tutor 流程。"
  }
]);
const input = ref("");
const selectedOptionIds = ref<string[]>([]);
const llmConfig = ref<LlmProviderConfig>(loadLlmConfig());
const showSettings = ref(false);
const showSessions = ref(false);
const sessionSearch = ref("");
const storedSessions = ref<StoredLearningSession[]>([]);
const selectedMessageIndex = ref(0);
const activeTimers = new Set<number>();
const streamRunning = ref(false);
const pdfRendering = ref(false);
const restoringSession = ref(false);

const currentPage = computed(() =>
  pages.value.find((page) => page.pageNumber === session.value.pageNumber)
);
const documentId = computed(() => activeDocument.value?.id ?? "demo-document");
const documentTitle = computed(
  () => activeDocument.value?.name.replace(/\.pdf$/i, "") ?? "Multimodal Learning Notes"
);
const documentMeta = computed(() => {
  if (!activeDocument.value) {
    return "Demo PDF";
  }

  const mb = activeDocument.value.size / 1024 / 1024;
  return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`;
});
const sessionPackage = computed(() =>
  buildSessionPackage({
    sessionId: learningSessionId.value,
    sessionName: learningSessionName.value,
    document: {
      id: documentId.value,
      title: documentTitle.value,
      pageCount: pages.value.length
    },
    activePage: currentPage.value
      ? {
          pageNumber: currentPage.value.pageNumber,
          imageDataUrl: currentPage.value.imageDataUrl
        }
      : undefined,
    learningSession: session.value,
    pageRecords: pageRecords.value,
    messages: messages.value
  })
);
const currentStoredSession = computed<StoredLearningSession>(() => ({
  id: learningSessionId.value,
  name: learningSessionName.value,
  documentTitle: documentTitle.value,
  documentId: documentId.value,
  pageCount: pages.value.length,
  activePageNumber: session.value.pageNumber,
  learningSession: session.value,
  messages: messages.value,
  pageRecords: pageRecords.value,
  pages: pages.value,
  searchableText: "",
  createdAt: learningSessionCreatedAt.value,
  updatedAt: new Date().toISOString()
}));

const statusLabel = computed(() => {
  const labels: Record<LearningSession["state"], string> = {
    idle: "Idle",
    page_selected: "Page Selected",
    preparing_context: "Preparing",
    explaining: "Explaining",
    questioning: "Questioning",
    awaiting_answer: "Awaiting Answer",
    evaluating_answer: "Evaluating",
    interrupted: "Interrupted",
    answering_user_question: "Answering",
    resuming_lesson: "Resuming",
    summarizing_page: "Summarizing",
    page_completed: "Completed",
    error: "Error"
  };

  return labels[session.value.state];
});

const canSend = computed(
  () => input.value.trim().length > 0 || selectedOptionIds.value.length > 0
);
const isWaitingAnswer = computed(() => session.value.state === "awaiting_answer");
const llmReady = computed(() => hasUsableLlmConfig(llmConfig.value));

function schedule(callback: () => void, delay: number) {
  const timer = window.setTimeout(() => {
    activeTimers.delete(timer);
    callback();
  }, delay);
  activeTimers.add(timer);
}

function clearTimers() {
  activeTimers.forEach((timer) => window.clearTimeout(timer));
  activeTimers.clear();
  streamRunning.value = false;
}

function addMessage(role: ChatMessage["role"], content: string, thinking?: string) {
  const extracted =
    role === "assistant" ? extractThinking(content) : { content, thinking };
  const displayContent =
    role === "system" && !extracted.content.startsWith("> ")
      ? `> ${extracted.content}`
      : extracted.content;
  messages.value.push({
    id: `${role}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    role,
    content: displayContent,
    thinking: thinking ?? extracted.thinking,
    state: session.value.state
  });

  selectedMessageIndex.value = messages.value.length - 1;
}

async function refreshStoredSessions() {
  storedSessions.value = sessionSearch.value
    ? await searchStoredSessions(sessionSearch.value)
    : await listStoredSessions();
}

async function persistCurrentSession() {
  try {
    await saveStoredSession(currentStoredSession.value);
    await refreshStoredSessions();
  } catch (error) {
    console.error("Failed to persist session", error);
  }
}

function restoreStoredSession(stored: StoredLearningSession) {
  restoringSession.value = true;
  learningSessionId.value = stored.id;
  learningSessionCreatedAt.value = stored.createdAt;
  learningSessionName.value = stored.name;
  session.value = stored.learningSession;
  messages.value = stored.messages;
  pageRecords.value = stored.pageRecords;
  pages.value = stored.pages;
  selectedMessageIndex.value = Math.max(stored.messages.length - 1, 0);
  showSessions.value = false;
  window.setTimeout(() => {
    restoringSession.value = false;
  }, 0);
}

function appendAssistant(content: string) {
  const last = messages.value[messages.value.length - 1];
  const extracted = extractThinking(content);

  if (last?.role === "assistant" && streamRunning.value) {
    last.content += extracted.content;
    if (extracted.thinking) {
      last.thinking = last.thinking
        ? `${last.thinking}\n\n${extracted.thinking}`
        : extracted.thinking;
    }
    return;
  }

  addMessage("assistant", extracted.content, extracted.thinking);
}

function replaceLastStreamingAssistant(content: string) {
  const last = messages.value[messages.value.length - 1];
  if (last?.role !== "assistant") {
    addMessage("assistant", content);
    return;
  }

  const extracted = extractThinking(content);
  last.content = extracted.content;
  last.thinking = extracted.thinking;
}

function dispatch(event: LearningEvent) {
  const result = transition(session.value, event);
  session.value = result.session;
  if (event.type === "LLM_ASKS_QUESTION" || event.type === "SELECT_PAGE") {
    selectedOptionIds.value = [];
  }
  runEffects(result.effects);
}

function runEffects(effects: LearningEffect[]) {
  effects.forEach((effect) => {
    switch (effect.type) {
      case "cancel_llm_stream":
        clearTimers();
        addMessage("system", "已中断当前 LLM 流。");
        break;

      case "render_page_context":
        addMessage(
          "system",
          `正在准备第 ${effect.pageNumber} 页：渲染页面图片，并附带可选文本上下文。`
        );
        schedule(() => {
          const page = pages.value.find(
            (candidate) => candidate.pageNumber === effect.pageNumber
          );
          const context: PageContext = {
            documentId: effect.documentId,
            pageNumber: effect.pageNumber,
            pageImage: {
              mimeType: "image/png",
              dataRef: page?.imageDataUrl ?? `mock-page-${effect.pageNumber}.png`
            },
            sources: [
              {
                type: "pdf_page",
                documentId: effect.documentId,
                pageNumber: effect.pageNumber
              }
            ],
            extractedText: page?.imageDataUrl
              ? `Rendered PDF page image for page ${effect.pageNumber}.`
              : "Mock extracted text: concepts, visual layout, and formulas.",
            previousPageSummary:
              effect.pageNumber > 1 ? "上一页已经建立了基本概念。" : undefined
          };
          dispatch({ type: "CONTEXT_READY", context });
        }, 420);
        break;

      case "start_llm_explanation":
        if (llmReady.value) {
          void startRealExplanation(effect.context);
        } else {
          startMockExplanation(effect.context);
        }
        break;

      case "start_llm_answer_evaluation":
        if (llmReady.value) {
          void startRealEvaluation(effect.questionId, effect.answer);
        } else {
          startMockEvaluation(effect.questionId, effect.answer);
        }
        break;

      case "start_llm_user_answer":
        if (llmReady.value) {
          void startRealUserQuestionAnswer(effect.message);
        } else {
          startMockUserQuestionAnswer(effect.message);
        }
        break;

      case "start_llm_page_summary":
        if (llmReady.value) {
          void startRealSummary();
        } else {
          startMockSummary();
        }
        break;

      case "save_page_record":
        pageRecords.value = [
          ...pageRecords.value.filter(
            (record) =>
              !(
                record.documentId === effect.record.documentId &&
                record.pageNumber === effect.record.pageNumber
              )
          ),
          effect.record
        ];
        pages.value = pages.value.map((page) =>
          page.pageNumber === effect.record.pageNumber
            ? { ...page, status: "completed" }
            : page
        );
        addMessage("system", "页面学习记录已保存，后续可进入 Typst 笔记模板。");
        break;
    }
  });
}

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

async function startRealExplanation(context: PageContext) {
  streamRunning.value = true;
  addMessage("system", `使用 ${llmConfig.value.model} 讲解第 ${context.pageNumber} 页。`);

  try {
    const payload = await createChatCompletionJsonStream<LlmExplanationPayload>(
      llmConfig.value,
      [
        {
          role: "system",
          content:
            "你是 VibeLearning 的主动学习 tutor。请基于当前学习单元讲解，并出一道单选题。只输出 JSON。"
        },
        {
          role: "user",
          content: [
            `会话上下文包: ${JSON.stringify(sessionPackage.value)}`,
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
      appendAssistant
    );

    replaceLastStreamingAssistant(payload.explanation);
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
    streamRunning.value = false;
    dispatch({ type: "LLM_ASKS_QUESTION", question });
    dispatch({ type: "QUESTION_RENDERED", questionId: question.id });
  } catch (error) {
    streamRunning.value = false;
    dispatch({
      type: "LLM_ERROR",
      error: error instanceof Error ? error.message : "LLM explanation failed."
    });
    addMessage("system", "真实 LLM 调用失败，检查 API key、base URL、模型名或浏览器 CORS。");
  }
}

async function startRealEvaluation(questionId: string, answer: string) {
  const question = session.value.currentQuestion;
  streamRunning.value = true;

  try {
    const payload = await createChatCompletionJsonStream<LlmEvaluationPayload>(
      llmConfig.value,
      [
        {
          role: "system",
          content:
            "你是 VibeLearning 的答案评价器。请评价用户答案，只输出 JSON。"
        },
        {
          role: "user",
          content: JSON.stringify({
            question,
            userAnswer: answer,
            sessionPackage: sessionPackage.value,
            schema: {
              feedback: "中文反馈",
              isCorrect: true,
              score: 0.8,
              missingConcepts: ["缺失概念"]
            }
          })
        }
      ],
      appendAssistant
    );

    replaceLastStreamingAssistant(payload.feedback);
    streamRunning.value = false;
    dispatch({
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
    streamRunning.value = false;
    dispatch({
      type: "LLM_ERROR",
      error: error instanceof Error ? error.message : "LLM evaluation failed."
    });
  }
}

async function startRealUserQuestionAnswer(message: string) {
  streamRunning.value = true;

  try {
    const payload = await createChatCompletionJsonStream<{ answer: string }>(
      llmConfig.value,
      [
        {
          role: "system",
          content:
            "你是 VibeLearning 的 tutor。回答用户打断问题，然后提醒可以回到原学习流程。只输出 JSON。"
        },
        {
          role: "user",
          content: JSON.stringify({
            currentState: session.value.state,
            currentQuestion: session.value.currentQuestion,
            sessionPackage: sessionPackage.value,
            userQuestion: message,
            schema: { answer: "中文回答" }
          })
        }
      ],
      appendAssistant
    );

    replaceLastStreamingAssistant(payload.answer);
    streamRunning.value = false;
    dispatch({ type: "LLM_FINISHES_USER_ANSWER" });
  } catch (error) {
    streamRunning.value = false;
    dispatch({
      type: "LLM_ERROR",
      error: error instanceof Error ? error.message : "LLM answer failed."
    });
  }
}

async function startRealSummary() {
  streamRunning.value = true;

  try {
    const payload = await createChatCompletionJsonStream<LlmSummaryPayload>(
      llmConfig.value,
      [
        {
          role: "system",
          content:
            "你是 VibeLearning 的学习记录器。总结当前页面学习结果，只输出 JSON。"
        },
        {
          role: "user",
          content: JSON.stringify({
            pageNumber: session.value.pageNumber,
            currentQuestion: session.value.currentQuestion,
            sessionPackage: sessionPackage.value,
            schema: {
              title: "标题",
              summary: "总结",
              keyPoints: ["关键点"]
            }
          })
        }
      ],
      appendAssistant
    );

    replaceLastStreamingAssistant(payload.summary);
    streamRunning.value = false;
    dispatch({
      type: "LLM_SUMMARIZES_PAGE",
      summary: {
        title: payload.title,
        summary: payload.summary,
        keyPoints: payload.keyPoints,
        formulas: [],
        questions: session.value.currentQuestion ? [session.value.currentQuestion] : [],
        mistakes: []
      }
    });
  } catch (error) {
    streamRunning.value = false;
    dispatch({
      type: "LLM_ERROR",
      error: error instanceof Error ? error.message : "LLM summary failed."
    });
  }
}

function startMockExplanation(context: PageContext) {
  streamRunning.value = true;
  appendAssistant(
    `<thinking>识别当前页面编号，先建立学习目标，再用单选题检查主线。</thinking>我看到了第 ${context.pageNumber} 页。`
  );
  schedule(() => appendAssistant(" 先抓主线：这页通常包含一个定义、一个动机，以及一个需要你主动检查的细节。"), 500);
  schedule(() => appendAssistant(" 我会先讲图和公式之间的关系，然后问你一个小问题。"), 1050);
  schedule(() => {
    streamRunning.value = false;
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
    dispatch({ type: "LLM_ASKS_QUESTION", question });
    dispatch({ type: "QUESTION_RENDERED", questionId: question.id });
  }, 1650);
}

function startMockEvaluation(questionId: string, answer: string) {
  streamRunning.value = true;
  appendAssistant("我来评价一下你的回答。");
  schedule(() => {
    const isChoiceCorrect =
      session.value.currentQuestion?.correctOptionIds?.join(",") === answer;
    appendAssistant(
      isChoiceCorrect || answer.length > 18
        ? " 方向是对的，重点就是抓住概念、图示和例子之间的支撑关系。"
        : " 这次不太对。我会先补上关键连接：概念不是孤立出现的，它服务于后面的公式或图示。"
    );
  }, 550);
  schedule(() => {
    const isChoiceCorrect =
      session.value.currentQuestion?.correctOptionIds?.join(",") === answer;
    streamRunning.value = false;
    dispatch({
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
  streamRunning.value = true;
  appendAssistant(`先处理你的问题：“${message}”。`);
  schedule(() => appendAssistant(" 简短说，它和当前页的主线有关，但不需要打断整个学习节奏。"), 520);
  schedule(() => appendAssistant(" 我会把这个点折回原来的讲解位置。"), 980);
  schedule(() => {
    streamRunning.value = false;
    dispatch({ type: "LLM_FINISHES_USER_ANSWER" });
  }, 1260);
}

function startMockSummary() {
  streamRunning.value = true;
  appendAssistant("这一页可以收束成三点：");
  schedule(() => appendAssistant(" 第一，先识别核心概念；第二，看它如何落到公式或图；第三，用一个问题检查自己是否真的懂了。"), 580);
  schedule(() => {
    streamRunning.value = false;
    const summary: PageSummary = {
      title: currentPage.value?.title ?? "页面总结",
      summary: "本页完成了一轮讲解、提问和回答评价。",
      keyPoints: ["核心概念", "图文关系", "主动回忆"],
      formulas: [],
      questions: session.value.currentQuestion ? [session.value.currentQuestion] : [],
      mistakes: []
    };
    dispatch({ type: "LLM_SUMMARIZES_PAGE", summary });
  }, 1120);
}

function selectPage(pageNumber: number) {
  pages.value = pages.value.map((page) => ({
    ...page,
    status:
      page.pageNumber === pageNumber && page.status !== "completed"
        ? "in_progress"
        : page.status
  }));
  dispatch({ type: "SELECT_PAGE", documentId: documentId.value, pageNumber });
  dispatch({ type: "PREPARE_CONTEXT" });
}

function createPlaceholderPages(count = 6): PdfPage[] {
  const accents: PdfPage["accent"][] = ["mint", "amber", "rose", "blue"];
  return Array.from({ length: count }, (_item, index) => ({
    pageNumber: index + 1,
    title: `课件页 ${index + 1}`,
    status: "not_started",
    accent: accents[index % accents.length]
  }));
}

async function onPdfSelected(event: Event) {
  const inputElement = event.target as HTMLInputElement;
  const file = inputElement.files?.[0];

  if (!file) {
    return;
  }

  if (activeDocument.value?.objectUrl) {
    URL.revokeObjectURL(activeDocument.value.objectUrl);
  }

  const objectUrl = URL.createObjectURL(file);
  activeDocument.value = {
    id: `local-${file.name}-${file.size}-${file.lastModified}`,
    name: file.name,
    size: file.size,
    objectUrl
  };
  pages.value = createPlaceholderPages();
  messages.value = [
    {
      id: "pdf-loaded",
      role: "system",
      content: `已选择 PDF：${file.name}。正在用 pdf.js 渲染页面。`
    }
  ];
  selectedMessageIndex.value = 0;
  dispatch({ type: "CANCEL" });
  inputElement.value = "";

  pdfRendering.value = true;
  try {
    const rendered = await renderPdfFile(file);
    pages.value = rendered.pages.map((page) => ({
      pageNumber: page.pageNumber,
      title: `第 ${page.pageNumber} 页`,
      status: "not_started",
      accent: ["mint", "amber", "rose", "blue"][
        (page.pageNumber - 1) % 4
      ] as PdfPage["accent"],
      imageDataUrl: page.dataUrl,
      width: page.width,
      height: page.height
    }));
    addMessage("system", `PDF 渲染完成，共 ${rendered.pageCount} 页。`);
  } catch (error) {
    addMessage(
      "system",
      `PDF 渲染失败：${error instanceof Error ? error.message : "unknown error"}`
    );
  } finally {
    pdfRendering.value = false;
  }
}

function sendInput() {
  const message = input.value.trim();
  if (!message && selectedOptionIds.value.length === 0) {
    return;
  }

  input.value = "";

  if (session.value.state === "awaiting_answer" && session.value.currentQuestion) {
    const selectedAnswer = selectedOptionIds.value.join(",");
    const selectedText = selectedOptionIds.value
      .map((id) => {
        const option = session.value.currentQuestion?.options?.find(
          (item) => item.id === id
        );
        return option ? `${id.toUpperCase()}. ${option.text}` : id;
      })
      .join("; ");
    const answerParts = [
      selectedAnswer ? `selected_options: ${selectedAnswer}` : "",
      message ? `text: ${message}` : ""
    ].filter(Boolean);
    const readableParts = [selectedText, message].filter(Boolean);
    const answer = answerParts.join("\n");
    const readableAnswer = readableParts.join("\n");

    addMessage("user", readableAnswer);
    selectedOptionIds.value = [];
    dispatch({
      type: "USER_ANSWER",
      questionId: session.value.currentQuestion.id,
      answer
    });
    return;
  }

  addMessage("user", message);

  if (streamRunning.value) {
    dispatch({ type: "USER_INTERRUPTS", message });
    return;
  }

  if (session.value.state === "interrupted") {
    dispatch({ type: "USER_MESSAGE", message });
    return;
  }

  dispatch({ type: "USER_INTERRUPTS", message });
}

function toggleOption(optionId: string) {
  const question = session.value.currentQuestion;
  if (!question) {
    return;
  }

  if (question.answerKind === "single_choice") {
    selectedOptionIds.value = [optionId];
    return;
  }

  if (selectedOptionIds.value.includes(optionId)) {
    selectedOptionIds.value = selectedOptionIds.value.filter((id) => id !== optionId);
    return;
  }

  selectedOptionIds.value = [...selectedOptionIds.value, optionId];
}

function interrupt() {
  dispatch({ type: "USER_INTERRUPTS" });
}

function newLearningSession() {
  clearTimers();
  learningSessionId.value = `session-${Date.now()}`;
  learningSessionCreatedAt.value = new Date().toISOString();
  learningSessionName.value = `Session ${new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  })}`;
  pageRecords.value = [];
  selectedOptionIds.value = [];
  session.value = { ...initialLearningSession };
  messages.value = [
    {
      id: `session-start-${Date.now()}`,
      role: "system",
      content: `已新建会话：${learningSessionName.value}。当前 PDF 保留，学习上下文已重置。`
    }
  ];
  selectedMessageIndex.value = 0;
}

function renameLearningSession() {
  const nextName = window.prompt("Session name", learningSessionName.value)?.trim();
  if (!nextName) {
    return;
  }

  learningSessionName.value = nextName;
  addMessage("system", `会话已重命名为：${nextName}`);
}

function persistLlmConfig() {
  saveLlmConfig(llmConfig.value);
  showSettings.value = false;
  addMessage(
    "system",
    llmReady.value
      ? `LLM 配置已保存：${llmConfig.value.model}`
      : "LLM 配置已保存，但尚未启用或缺少必要字段。"
  );
}

function resetLlmConfig() {
  llmConfig.value = { ...defaultLlmConfig };
  saveLlmConfig(llmConfig.value);
}

function onKeydown(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null;
  const isTyping = target?.tagName === "TEXTAREA" || target?.tagName === "INPUT";

  if (event.ctrlKey && event.key.toLowerCase() === "c") {
    event.preventDefault();
    interrupt();
    return;
  }

  if (isTyping) {
    return;
  }

  if (event.key === "j") {
    selectedMessageIndex.value = Math.min(
      selectedMessageIndex.value + 1,
      messages.value.length - 1
    );
  }

  if (event.key === "k") {
    selectedMessageIndex.value = Math.max(selectedMessageIndex.value - 1, 0);
  }

}

let saveTimer: number | undefined;

watch(
  currentStoredSession,
  () => {
    if (restoringSession.value) {
      return;
    }

    if (saveTimer) {
      window.clearTimeout(saveTimer);
    }

    saveTimer = window.setTimeout(() => {
      void persistCurrentSession();
    }, 500);
  },
  { deep: true }
);

watch(sessionSearch, () => {
  void refreshStoredSessions();
});

onMounted(() => {
  window.addEventListener("keydown", onKeydown);
  void persistCurrentSession();
  void refreshStoredSessions();
});
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKeydown);
  if (saveTimer) {
    window.clearTimeout(saveTimer);
  }
  clearTimers();
  if (activeDocument.value?.objectUrl) {
    URL.revokeObjectURL(activeDocument.value.objectUrl);
  }
});
</script>

<template>
  <main class="app-shell">
    <section class="learning-pane" aria-label="LLM learning pane">
      <SessionHeader
        :session-name="learningSessionName"
        :llm-ready="llmReady"
        :llm-model="llmConfig.model"
        @new-session="newLearningSession"
        @rename-session="renameLearningSession"
        @toggle-sessions="showSessions = !showSessions"
        @toggle-settings="showSettings = !showSettings"
      />

      <section v-if="showSessions" class="sessions-panel">
        <input
          v-model="sessionSearch"
          type="search"
          placeholder="Search sessions..."
          spellcheck="false"
        />
        <div class="session-results">
          <button
            v-for="stored in storedSessions"
            :key="stored.id"
            type="button"
            class="session-result"
            :class="{ active: stored.id === learningSessionId }"
            @click="restoreStoredSession(stored)"
          >
            <strong>{{ stored.name }}</strong>
            <span>{{ stored.documentTitle }} · {{ stored.pageCount }} pages</span>
          </button>
          <p v-if="storedSessions.length === 0">No saved sessions.</p>
        </div>
      </section>

      <section v-if="showSettings" class="settings-panel">
        <label>
          <span>Base URL</span>
          <input v-model="llmConfig.baseUrl" type="text" spellcheck="false" />
        </label>
        <label>
          <span>Model</span>
          <input v-model="llmConfig.model" type="text" spellcheck="false" />
        </label>
        <label>
          <span>API Key</span>
          <input v-model="llmConfig.apiKey" type="password" spellcheck="false" />
        </label>
        <label class="toggle-row">
          <input v-model="llmConfig.enabled" type="checkbox" />
          <span>Use real LLM</span>
        </label>
        <p>
          配置存储在本浏览器的 localStorage。纯前端模式会把 key 用于浏览器直连
          Chat Completions；如果遇到 CORS，请改用兼容代理或后续 Tauri 本地层。
        </p>
        <div class="settings-actions">
          <button type="button" class="icon-button" @click="resetLlmConfig">Reset</button>
          <button type="button" class="send-button" @click="persistLlmConfig">Save</button>
        </div>
      </section>

      <div class="status-row">
        <div class="state-pill">
          <Loader2 v-if="streamRunning" :size="15" class="spin" />
          <Circle v-else-if="session.state === 'idle'" :size="15" />
          <CheckCircle2 v-else-if="session.state === 'page_completed'" :size="15" />
          <Bot v-else :size="15" />
          <span>{{ statusLabel }}</span>
        </div>

        <div class="page-chip">
          <BookOpen :size="15" />
          <span>{{ currentPage ? `Page ${currentPage.pageNumber}` : "No page" }}</span>
        </div>
      </div>

      <MessageList :messages="messages" :selected-index="selectedMessageIndex" />

      <QuestionPanel
        :question="session.currentQuestion"
        :learning-state="session.state"
        :selected-option-ids="selectedOptionIds"
        @toggle-option="toggleOption"
      />

      <ComposerBar
        v-model="input"
        :is-waiting-answer="isWaitingAnswer"
        :can-send="canSend"
        :stream-running="streamRunning"
        @send="sendInput"
      />
    </section>

    <PdfPane
      :pages="pages"
      :active-page-number="session.pageNumber"
      :document-title="documentTitle"
      :document-meta="documentMeta"
      :pdf-rendering="pdfRendering"
      @select-page="selectPage"
      @pdf-selected="onPdfSelected"
    />
  </main>
</template>
