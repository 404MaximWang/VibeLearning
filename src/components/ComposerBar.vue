<script setup lang="ts">
import { Send } from "lucide-vue-next";

defineProps<{
  modelValue: string;
  isWaitingAnswer: boolean;
  canSend: boolean;
  streamRunning: boolean;
}>();

defineEmits<{
  "update:modelValue": [value: string];
  send: [];
}>();
</script>

<template>
  <footer class="composer">
    <textarea
      id="chat-input"
      :value="modelValue"
      rows="3"
      :placeholder="isWaitingAnswer ? '回答 tutor 的问题...' : '输入问题，或在生成时打断 tutor...'"
      @input="$emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
      @keydown.enter.exact.prevent="$emit('send')"
    />

    <div class="composer-actions">
      <button type="button" class="send-button" :disabled="!canSend" @click="$emit('send')">
        <Send :size="17" />
        <span>{{ streamRunning ? "Send anyway" : "Send" }}</span>
      </button>
    </div>
  </footer>
</template>
