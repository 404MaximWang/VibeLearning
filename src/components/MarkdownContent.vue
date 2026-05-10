<script setup lang="ts">
import MarkdownIt from "markdown-it";
import { computed } from "vue";

const props = defineProps<{
  content: string;
}>();

const md = new MarkdownIt({
  breaks: true,
  linkify: true
});

const html = computed(() => md.render(props.content));
</script>

<template>
  <!-- Markdown content is produced from local chat text. HTML is disabled by markdown-it default. -->
  <div class="markdown-content" v-html="html" />
</template>
