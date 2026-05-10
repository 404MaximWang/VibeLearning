<script setup lang="ts">
import { Bot, Terminal } from "lucide-vue-next";
import { nextTick, ref, watch } from "vue";
import type { ChatMessage } from "../types/learning";
import MarkdownContent from "./MarkdownContent.vue";

const props = defineProps<{
  messages: ChatMessage[];
  selectedIndex: number;
}>();

const messageList = ref<HTMLElement | null>(null);

watch(
  () => props.messages.length,
  () => {
    void nextTick(() => {
      messageList.value?.scrollTo({
        top: messageList.value.scrollHeight,
        behavior: "smooth"
      });
    });
  }
);
</script>

<template>
  <div ref="messageList" class="message-list">
    <article
      v-for="(message, index) in messages"
      :key="message.id"
      class="message"
      :class="[message.role, { selected: index === selectedIndex }]"
    >
      <div v-if="message.role !== 'system'" class="message-role">
        <Bot v-if="message.role === 'assistant'" :size="15" />
        <Terminal v-else :size="15" />
        <span>{{ message.role }}</span>
      </div>
      <p v-if="message.role === 'system'" class="system-text">{{ message.content }}</p>
      <MarkdownContent v-else :content="message.content" />
      <details v-if="message.thinking" class="thinking-block">
        <summary>Thinking</summary>
        <pre>{{ message.thinking }}</pre>
      </details>
    </article>
  </div>
</template>
