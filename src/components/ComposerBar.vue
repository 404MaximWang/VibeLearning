<script setup lang="ts">
import { Hand, Send } from "lucide-vue-next";

defineProps<{
  modelValue: string;
  isWaitingAnswer: boolean;
  canSend: boolean;
  streamRunning: boolean;
}>();

defineEmits<{
  "update:modelValue": [value: string];
  interrupt: [];
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
      <button
        v-if="streamRunning"
        type="button"
        class="icon-button"
        title="Interrupt"
        @click="$emit('interrupt')"
      >
        <Hand :size="16" />
        <span>Interrupt</span>
      </button>
      <button type="button" class="send-button" :disabled="!canSend" @click="$emit('send')">
        <Send :size="17" />
        <span>{{ streamRunning ? "Send anyway" : "Send" }}</span>
      </button>
    </div>
  </footer>
</template>
