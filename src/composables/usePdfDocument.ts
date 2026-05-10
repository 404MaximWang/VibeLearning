import { computed, onBeforeUnmount, ref } from "vue";
import { renderPdfFile } from "../services/pdfRenderer";
import type { ChatMessage } from "../types/learning";
import type { PdfDocument, PdfPage } from "../types/pdf";

type UsePdfDocumentOptions = {
  addMessage: (role: ChatMessage["role"], content: string) => void;
  onDocumentReset: () => void;
  onMessagesReset: (messages: ChatMessage[]) => void;
  onSelectWelcomeMessage: () => void;
};

function createPlaceholderPages(count = 6): PdfPage[] {
  const accents: PdfPage["accent"][] = ["mint", "amber", "rose", "blue"];
  return Array.from({ length: count }, (_item, index) => ({
    pageNumber: index + 1,
    title: `课件页 ${index + 1}`,
    status: "not_started",
    accent: accents[index % accents.length]
  }));
}

export function usePdfDocument(options: UsePdfDocumentOptions) {
  const activeDocument = ref<PdfDocument | null>(null);
  const pages = ref<PdfPage[]>([
    { pageNumber: 1, title: "概念入口", status: "not_started", accent: "mint" },
    { pageNumber: 2, title: "核心公式", status: "not_started", accent: "amber" },
    { pageNumber: 3, title: "图表解释", status: "not_started", accent: "rose" },
    { pageNumber: 4, title: "练习页", status: "not_started", accent: "blue" }
  ]);
  const pdfRendering = ref(false);

  const documentId = computed(() => activeDocument.value?.id ?? "demo-document");
  const documentTitle = computed(
    () => activeDocument.value?.name.replace(/\.pdf$/i, "") ?? "Multimodal Learning Notes"
  );
  const documentMeta = computed(() => {
    if (!activeDocument.value) {
      return "Demo PDF";
    }

    const mb = activeDocument.value.size / 1024 / 1024;
    return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`;
  });

  async function onPdfSelected(event: Event) {
    const inputElement = event.target as HTMLInputElement;
    const file = inputElement.files?.[0];

    if (!file) {
      return;
    }

    if (activeDocument.value?.objectUrl) {
      URL.revokeObjectURL(activeDocument.value.objectUrl);
    }

    const objectUrl = URL.createObjectURL(file);
    activeDocument.value = {
      id: `local-${file.name}-${file.size}-${file.lastModified}`,
      name: file.name,
      size: file.size,
      objectUrl
    };
    pages.value = createPlaceholderPages();
    options.onMessagesReset([
      {
        id: "pdf-loaded",
        role: "system",
        content: `已选择 PDF：${file.name}。正在用 pdf.js 渲染页面。`
      }
    ]);
    options.onSelectWelcomeMessage();
    options.onDocumentReset();
    inputElement.value = "";

    pdfRendering.value = true;
    try {
      const rendered = await renderPdfFile(file);
      pages.value = rendered.pages.map((page) => ({
        pageNumber: page.pageNumber,
        title: `第 ${page.pageNumber} 页`,
        status: "not_started",
        accent: ["mint", "amber", "rose", "blue"][
          (page.pageNumber - 1) % 4
        ] as PdfPage["accent"],
        imageDataUrl: page.dataUrl,
        width: page.width,
        height: page.height
      }));
      options.addMessage("system", `PDF 渲染完成，共 ${rendered.pageCount} 页。`);
    } catch (error) {
      options.addMessage(
        "system",
        `PDF 渲染失败：${error instanceof Error ? error.message : "unknown error"}`
      );
    } finally {
      pdfRendering.value = false;
    }
  }

  function releaseDocument() {
    if (activeDocument.value?.objectUrl) {
      URL.revokeObjectURL(activeDocument.value.objectUrl);
    }
  }

  onBeforeUnmount(() => {
    releaseDocument();
  });

  return {
    activeDocument,
    documentId,
    documentMeta,
    documentTitle,
    onPdfSelected,
    pages,
    pdfRendering,
    releaseDocument
  };
}
