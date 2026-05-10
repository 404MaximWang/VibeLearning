<script setup lang="ts">
import type { LearningQuestion, LearningState } from "../types/learning";

defineProps<{
  question?: LearningQuestion;
  learningState: LearningState;
  selectedOptionIds: string[];
}>();

defineEmits<{
  "toggle-option": [optionId: string];
}>();
</script>

<template>
  <section v-if="question" class="question-band">
    <div>
      <p class="eyebrow">Tutor Question</p>
      <strong>{{ question.prompt }}</strong>
      <div
        v-if="question.options"
        class="choice-list"
        :class="{ disabled: learningState !== 'awaiting_answer' }"
      >
        <button
          v-for="option in question.options"
          :key="option.id"
          type="button"
          class="choice-option"
          :class="{ selected: selectedOptionIds.includes(option.id) }"
          :disabled="learningState !== 'awaiting_answer'"
          @click="$emit('toggle-option', option.id)"
        >
          <span>{{ option.id.toUpperCase() }}</span>
          <p>{{ option.text }}</p>
        </button>
      </div>
    </div>
    <span>{{ question.answerKind.replace("_", " ") }}</span>
  </section>
</template>
