import { computed, onBeforeUnmount, onMounted, ref, type ComputedRef, type Ref } from "vue";
import { useChatTranscript } from "./useChatTranscript";
import { initialLearningSession, transition } from "../state/learningStateMachine";
import type {
  LearningEffect,
  LearningEvent,
  LearningSession,
  PageContext,
  PageLearningRecord
} from "../types/learning";
import type { PdfPage } from "../types/pdf";
import type { LlmProviderConfig } from "../services/llmConfig";
import type { StoredLearningSession } from "../services/sessionStore";
import { buildSessionPackage } from "../services/sessionPackage";
import { createTutorRuntime } from "../services/tutorRuntime";

type UseLearningControllerOptions = {
  pages: Ref<PdfPage[]>;
  documentId: ComputedRef<string>;
  documentTitle: ComputedRef<string>;
  llmConfig: Ref<LlmProviderConfig>;
  llmReady: ComputedRef<boolean>;
  currentPage: ComputedRef<PdfPage | undefined>;
};

export function useLearningController(options: UseLearningControllerOptions) {
  const session = ref<LearningSession>({ ...initialLearningSession });
  const selectedPageNumber = ref<number | undefined>(undefined);
  const learningSessionId = ref(`session-${Date.now()}`);
  const learningSessionCreatedAt = ref(new Date().toISOString());
  const learningSessionName = ref("Untitled Session");
  const pageRecords = ref<PageLearningRecord[]>([]);
  const input = ref("");
  const selectedOptionIds = ref<string[]>([]);
  const streamRunning = ref(false);
  const activeTimers = new Set<number>();
  const {
    addMessage,
    appendAssistant,
    messages,
    replaceLastStreamingAssistant,
    replaceMessages,
    selectedMessageIndex,
    selectLastMessage,
    selectWelcomeMessage
  } = useChatTranscript({
    getCurrentState: () => session.value.state,
    isStreaming: () => streamRunning.value
  });

  const sessionPackage = computed(() =>
    buildSessionPackage({
      sessionId: learningSessionId.value,
      sessionName: learningSessionName.value,
      document: {
        id: options.documentId.value,
        title: options.documentTitle.value,
        pageCount: options.pages.value.length
      },
      activePage: options.currentPage.value
        ? {
            pageNumber: options.currentPage.value.pageNumber,
            imageDataUrl: options.currentPage.value.imageDataUrl
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
    documentTitle: options.documentTitle.value,
    documentId: options.documentId.value,
    pageCount: options.pages.value.length,
    activePageNumber: selectedPageNumber.value ?? session.value.pageNumber,
    learningSession: session.value,
    messages: messages.value,
    pageRecords: pageRecords.value,
    pages: options.pages.value,
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

  function dispatch(event: LearningEvent) {
    const result = transition(session.value, event);
    session.value = result.session;
    if (event.type === "LLM_ASKS_QUESTION" || event.type === "SELECT_PAGE") {
      selectedOptionIds.value = [];
    }
    runEffects(result.effects);
  }

  const tutorRuntime = createTutorRuntime({
    getLlmConfig: () => options.llmConfig.value,
    getSessionPackage: () => sessionPackage.value,
    getSession: () => session.value,
    getCurrentPageTitle: () => options.currentPage.value?.title,
    addMessage,
    appendAssistant,
    replaceLastStreamingAssistant,
    dispatch,
    schedule,
    setStreamRunning(value: boolean) {
      streamRunning.value = value;
    }
  });

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
            const page = options.pages.value.find(
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
          if (options.llmReady.value) {
            void tutorRuntime.startRealExplanation(effect.context);
          } else {
            tutorRuntime.startMockExplanation(effect.context);
          }
          break;

        case "start_llm_answer_evaluation":
          if (options.llmReady.value) {
            void tutorRuntime.startRealEvaluation(effect.questionId, effect.answer);
          } else {
            tutorRuntime.startMockEvaluation(effect.questionId, effect.answer);
          }
          break;

        case "start_llm_user_answer":
          if (options.llmReady.value) {
            void tutorRuntime.startRealUserQuestionAnswer(effect.message);
          } else {
            tutorRuntime.startMockUserQuestionAnswer(effect.message);
          }
          break;

        case "start_llm_page_summary":
          if (options.llmReady.value) {
            void tutorRuntime.startRealSummary();
          } else {
            tutorRuntime.startMockSummary();
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
          options.pages.value = options.pages.value.map((page) =>
            page.pageNumber === effect.record.pageNumber
              ? { ...page, status: "completed" }
              : page
          );
          addMessage("system", "页面学习记录已保存，后续可进入 Typst 笔记模板。");
          break;
      }
    });
  }

  function selectPage(pageNumber: number) {
    selectedPageNumber.value = pageNumber;
  }

  function activateSelectedPage() {
    if (!selectedPageNumber.value) {
      return;
    }

    options.pages.value = options.pages.value.map((page) => ({
      ...page,
      status:
        page.pageNumber === selectedPageNumber.value && page.status !== "completed"
          ? "in_progress"
          : page.status
    }));
    dispatch({
      type: "SELECT_PAGE",
      documentId: options.documentId.value,
      pageNumber: selectedPageNumber.value
    });
    dispatch({ type: "PREPARE_CONTEXT" });
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
    selectedPageNumber.value = undefined;
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

  function restoreFromStoredSession(stored: StoredLearningSession) {
    learningSessionId.value = stored.id;
    learningSessionCreatedAt.value = stored.createdAt;
    learningSessionName.value = stored.name;
    session.value = stored.learningSession;
    selectedPageNumber.value = stored.activePageNumber ?? stored.learningSession.pageNumber;
    messages.value = stored.messages;
    pageRecords.value = stored.pageRecords;
    options.pages.value = stored.pages;
    selectLastMessage();
  }

  function resetForDocumentSelection() {
    selectedPageNumber.value = undefined;
    dispatch({ type: "CANCEL" });
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

    if (event.key === "Enter") {
      event.preventDefault();
      activateSelectedPage();
    }
  }

  onMounted(() => {
    window.addEventListener("keydown", onKeydown);
  });

  onBeforeUnmount(() => {
    window.removeEventListener("keydown", onKeydown);
    clearTimers();
  });

  return {
    addMessage,
    canSend,
    currentStoredSession,
    input,
    interrupt,
    isWaitingAnswer,
    learningSessionCreatedAt,
    learningSessionId,
    learningSessionName,
    messages,
    newLearningSession,
    pageRecords,
    renameLearningSession,
    replaceMessages,
    resetForDocumentSelection,
    restoreFromStoredSession,
    selectedPageNumber,
    selectPage,
    selectedMessageIndex,
    selectedOptionIds,
    selectWelcomeMessage,
    sendInput,
    session,
    sessionPackage,
    statusLabel,
    streamRunning,
    toggleOption
  };
}
