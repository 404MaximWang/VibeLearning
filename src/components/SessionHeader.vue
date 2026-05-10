<script setup lang="ts">
import { FilePlus2, KeyRound } from "lucide-vue-next";

defineProps<{
  sessionName: string;
  llmReady: boolean;
  llmModel: string;
}>();

defineEmits<{
  "new-session": [];
  "rename-session": [];
  "toggle-sessions": [];
  "toggle-settings": [];
}>();
</script>

<template>
  <header class="topbar">
    <div>
      <p class="eyebrow">VibeLearning</p>
      <h1>{{ sessionName }}</h1>
    </div>

    <div class="topbar-actions">
      <button type="button" class="icon-button" title="New session" @click="$emit('new-session')">
        <FilePlus2 :size="16" />
      </button>
      <button
        type="button"
        class="session-name-button"
        title="Search sessions"
        @click="$emit('toggle-sessions')"
      >
        Sessions
      </button>
      <button
        type="button"
        class="session-name-button"
        title="Rename session"
        @click="$emit('rename-session')"
      >
        Rename
      </button>
      <button
        type="button"
        class="llm-button"
        :class="{ ready: llmReady }"
        title="LLM settings"
        @click="$emit('toggle-settings')"
      >
        <KeyRound :size="16" />
        <span>{{ llmReady ? llmModel : "Mock" }}</span>
      </button>
    </div>
  </header>
</template>
