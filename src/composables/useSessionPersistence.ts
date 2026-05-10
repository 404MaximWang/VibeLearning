import { onBeforeUnmount, onMounted, ref, watch, type ComputedRef, type Ref } from "vue";
import {
  deleteStoredSession,
  listStoredSessions,
  saveStoredSession,
  searchStoredSessions,
  type StoredLearningSession
} from "../services/sessionStore";

type UseSessionPersistenceOptions = {
  currentStoredSession: ComputedRef<StoredLearningSession>;
  restoringSession: Ref<boolean>;
  onRenameStoredSession?: (stored: StoredLearningSession, nextName: string) => void;
  onRestoreSession: (stored: StoredLearningSession) => void;
};

export function useSessionPersistence(options: UseSessionPersistenceOptions) {
  const showSessions = ref(false);
  const sessionSearch = ref("");
  const storedSessions = ref<StoredLearningSession[]>([]);
  let saveTimer: number | undefined;

  async function refreshStoredSessions() {
    storedSessions.value = sessionSearch.value
      ? await searchStoredSessions(sessionSearch.value)
      : await listStoredSessions();
  }

  async function persistCurrentSession() {
    try {
      await saveStoredSession(options.currentStoredSession.value);
      await refreshStoredSessions();
    } catch (error) {
      console.error("Failed to persist session", error);
    }
  }

  function restoreStoredSession(stored: StoredLearningSession) {
    options.onRestoreSession(stored);
    showSessions.value = false;
  }

  async function renameStoredSession(stored: StoredLearningSession) {
    const nextName = window.prompt("Session name", stored.name)?.trim();
    if (!nextName || nextName === stored.name) {
      return;
    }

    await saveStoredSession({
      ...stored,
      name: nextName
    });

    options.onRenameStoredSession?.(stored, nextName);
    await refreshStoredSessions();
  }

  async function removeStoredSession(stored: StoredLearningSession) {
    const confirmed = window.confirm(`Delete session "${stored.name}"?`);
    if (!confirmed) {
      return;
    }

    await deleteStoredSession(stored.id);
    await refreshStoredSessions();
  }

  watch(
    options.currentStoredSession,
    () => {
      if (options.restoringSession.value) {
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
    void persistCurrentSession();
    void refreshStoredSessions();
  });

  onBeforeUnmount(() => {
    if (saveTimer) {
      window.clearTimeout(saveTimer);
    }
  });

  return {
    persistCurrentSession,
    refreshStoredSessions,
    removeStoredSession,
    renameStoredSession,
    restoreStoredSession,
    sessionSearch,
    showSessions,
    storedSessions
  };
}
