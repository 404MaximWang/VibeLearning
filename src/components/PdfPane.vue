<script setup lang="ts">
import { FileText, Upload } from "lucide-vue-next";
import { ref } from "vue";
import type { PdfPage } from "../types/pdf";

defineProps<{
  pages: PdfPage[];
  activePageNumber?: number;
  documentTitle: string;
  documentMeta: string;
  pdfRendering: boolean;
}>();

const emit = defineEmits<{
  "select-page": [pageNumber: number];
  "pdf-selected": [event: Event];
}>();

const fileInput = ref<HTMLInputElement | null>(null);

function openPdfPicker() {
  fileInput.value?.click();
}
</script>

<template>
  <section class="pdf-pane" aria-label="PDF pane">
    <header class="pdf-header">
      <div>
        <p class="eyebrow">{{ pdfRendering ? "Rendering PDF" : documentMeta }}</p>
        <h2 :title="documentTitle">{{ documentTitle }}</h2>
      </div>
      <div class="nav-buttons">
        <input
          ref="fileInput"
          class="file-input"
          type="file"
          accept="application/pdf,.pdf"
          @change="emit('pdf-selected', $event)"
        />
        <button class="send-button" type="button" title="Open PDF" @click="openPdfPicker">
          <Upload :size="17" />
          <span>PDF</span>
        </button>
      </div>
    </header>

    <div class="pdf-scroll">
      <div
        v-for="page in pages"
        :key="page.pageNumber"
        class="pdf-page"
        :class="[page.accent, { active: page.pageNumber === activePageNumber }]"
        @click="emit('select-page', page.pageNumber)"
      >
        <div class="page-toolbar">
          <span>Page {{ page.pageNumber }}</span>
          <span>{{ page.status.replace("_", " ") }}</span>
        </div>
        <div class="mock-paper">
          <div v-if="page.imageDataUrl" class="rendered-page-frame">
            <img
              class="rendered-page"
              :src="page.imageDataUrl"
              :alt="`${documentTitle} page ${page.pageNumber}`"
              @error="console.error('PDF page image failed to load', page.pageNumber)"
            />
          </div>
          <template v-else>
            <div class="paper-title">
              <FileText :size="18" />
              <strong>{{ page.title }}</strong>
            </div>
            <div class="paper-lines">
              <span />
              <span />
              <span />
              <span />
            </div>
            <div class="paper-figure">
              <i />
              <i />
              <i />
            </div>
            <div class="paper-formula">f(x) -> insight -> test</div>
          </template>
        </div>
      </div>
    </div>
  </section>
</template>
