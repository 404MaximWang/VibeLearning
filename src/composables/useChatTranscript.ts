import { ref } from "vue";
import type { ChatMessage, LearningState } from "../types/learning";
import { extractThinking } from "../utils/thinking";

type UseChatTranscriptOptions = {
  initialMessages?: ChatMessage[];
  getCurrentState?: () => LearningState;
  isStreaming?: () => boolean;
};

function buildMessage(
  role: ChatMessage["role"],
  content: string,
  state?: LearningState,
  thinking?: string
): ChatMessage {
  const extracted =
    role === "assistant" ? extractThinking(content) : { content, thinking };
  const displayContent =
    role === "system" && !extracted.content.startsWith("> ")
      ? `> ${extracted.content}`
      : extracted.content;

  return {
    id: `${role}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    role,
    content: displayContent,
    thinking: thinking ?? extracted.thinking,
    state
  };
}

export function useChatTranscript(options: UseChatTranscriptOptions = {}) {
  const messages = ref<ChatMessage[]>(
    options.initialMessages ?? [
      {
        id: "welcome",
        role: "system",
        content: "选择右侧任意页面，学习状态机会启动一轮 mock tutor 流程。"
      }
    ]
  );
  const selectedMessageIndex = ref(Math.max(messages.value.length - 1, 0));

  function addMessage(role: ChatMessage["role"], content: string, thinking?: string) {
    messages.value.push(
      buildMessage(role, content, options.getCurrentState?.(), thinking)
    );
    selectedMessageIndex.value = messages.value.length - 1;
  }

  function appendAssistant(content: string) {
    const last = messages.value[messages.value.length - 1];
    const extracted = extractThinking(content);

    if (last?.role === "assistant" && options.isStreaming?.()) {
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

  function replaceMessages(nextMessages: ChatMessage[]) {
    messages.value = nextMessages;
  }

  function selectWelcomeMessage() {
    selectedMessageIndex.value = 0;
  }

  function selectLastMessage() {
    selectedMessageIndex.value = Math.max(messages.value.length - 1, 0);
  }

  function selectNextMessage() {
    selectedMessageIndex.value = Math.min(
      selectedMessageIndex.value + 1,
      messages.value.length - 1
    );
  }

  function selectPreviousMessage() {
    selectedMessageIndex.value = Math.max(selectedMessageIndex.value - 1, 0);
  }

  return {
    addMessage,
    appendAssistant,
    messages,
    replaceLastStreamingAssistant,
    replaceMessages,
    selectedMessageIndex,
    selectLastMessage,
    selectNextMessage,
    selectPreviousMessage,
    selectWelcomeMessage
  };
}
