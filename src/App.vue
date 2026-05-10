<script setup lang="ts">
import { BookOpen, Bot, CheckCircle2, Circle, Loader2, Pencil, Trash2 } from "lucide-vue-next";
import { computed, ref } from "vue";
import ComposerBar from "./components/ComposerBar.vue";
import { useLearningController } from "./composables/useLearningController";
import { useLlmSettings } from "./composables/useLlmSettings";
import MessageList from "./components/MessageList.vue";
import PdfPane from "./components/PdfPane.vue";
import QuestionPanel from "./components/QuestionPanel.vue";
import SessionHeader from "./components/SessionHeader.vue";
import { usePdfDocument } from "./composables/usePdfDocument";
import { useSessionPersistence } from "./composables/useSessionPersistence";
import type { StoredLearningSession } from "./services/sessionStore";
import type { ChatMessage } from "./types/learning";

const restoringSession = ref(false);

const {
  documentId,
  documentMeta,
  documentTitle,
  onPdfSelected,
  pages,
  pdfRendering
} = usePdfDocument({
  addMessage(role, content) {
    learning.addMessage(role as ChatMessage["role"], content);
  },
  onDocumentReset() {
    learning.resetForDocumentSelection();
  },
  onMessagesReset(nextMessages) {
    learning.replaceMessages(nextMessages);
  },
  onSelectWelcomeMessage() {
    learning.selectWelcomeMessage();
  }
});

const currentPage = computed(() =>
  pages.value.find((page) => page.pageNumber === session.value.pageNumber)
);

const {
  llmConfig,
  llmReady,
  persistLlmConfig,
  resetLlmConfig,
  showSettings
} = useLlmSettings({
  onPersist(config, ready) {
    learning.addMessage(
      "system",
      ready
        ? `LLM 配置已保存：${config.model}`
        : "LLM 配置已保存，但尚未启用或缺少必要字段。"
    );
  }
});

const learning = useLearningController({
  pages,
  documentId,
  documentTitle,
  llmConfig,
  llmReady,
  currentPage
});

const {
  canSend,
  currentStoredSession,
  input,
  interrupt,
  isWaitingAnswer,
  learningSessionId,
  learningSessionName,
  messages,
  newLearningSession,
  renameLearningSession,
  restoreFromStoredSession,
  selectedPageNumber,
  selectPage,
  selectedMessageIndex,
  selectedOptionIds,
  sendInput,
  session,
  statusLabel,
  streamRunning,
  toggleOption
} = learning;

const {
  removeStoredSession,
  renameStoredSession,
  restoreStoredSession,
  sessionSearch,
  showSessions,
  storedSessions
} = useSessionPersistence({
  currentStoredSession,
  restoringSession,
  onRenameStoredSession(stored: StoredLearningSession, nextName: string) {
    if (stored.id === learningSessionId.value) {
      learningSessionName.value = nextName;
    }
  },
  onRestoreSession(stored: StoredLearningSession) {
    restoringSession.value = true;
    restoreFromStoredSession(stored);
    window.setTimeout(() => {
      restoringSession.value = false;
    }, 0);
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
          <div
            v-for="stored in storedSessions"
            :key="stored.id"
            class="session-result"
            :class="{ active: stored.id === learningSessionId }"
          >
            <button type="button" class="session-result-main" @click="restoreStoredSession(stored)">
              <strong>{{ stored.name }}</strong>
              <span>{{ stored.documentTitle }} · {{ stored.pageCount }} pages</span>
            </button>
            <div class="session-result-actions">
              <button
                type="button"
                class="icon-button"
                title="Rename session"
                @click.stop="void renameStoredSession(stored)"
              >
                <Pencil :size="14" />
              </button>
              <button
                type="button"
                class="icon-button danger"
                title="Delete session"
                @click.stop="void removeStoredSession(stored)"
              >
                <Trash2 :size="14" />
              </button>
            </div>
          </div>
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
          <span>{{
            selectedPageNumber
              ? `Page ${selectedPageNumber}`
              : currentPage
                ? `Page ${currentPage.pageNumber}`
                : "No page"
          }}</span>
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
        @interrupt="interrupt"
        @send="sendInput"
      />
    </section>

    <PdfPane
      :pages="pages"
      :active-page-number="selectedPageNumber ?? session.pageNumber"
      :document-title="documentTitle"
      :document-meta="documentMeta"
      :pdf-rendering="pdfRendering"
      @select-page="selectPage"
      @pdf-selected="onPdfSelected"
    />
  </main>
</template>
