import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export type RenderedPdfPage = {
  pageNumber: number;
  dataUrl: string;
  width: number;
  height: number;
};

export type RenderedPdfDocument = {
  pageCount: number;
  pages: RenderedPdfPage[];
};

export async function renderPdfFile(
  file: File,
  maxPreviewWidth = 1400
): Promise<RenderedPdfDocument> {
  const data = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({
    data,
    cMapPacked: true,
    cMapUrl: "/pdfjs/cmaps/",
    standardFontDataUrl: "/pdfjs/standard_fonts/",
    useSystemFonts: true
  }).promise;
  const pages: RenderedPdfPage[] = [];

  for (let index = 1; index <= pdf.numPages; index += 1) {
    const page = await pdf.getPage(index);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(maxPreviewWidth / baseViewport.width, 1.5);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Could not create canvas context for PDF rendering.");
    }

    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);

    await page.render({
      canvas,
      canvasContext: context,
      viewport
    }).promise;

    pages.push({
      pageNumber: index,
      dataUrl: canvas.toDataURL("image/png"),
      width: canvas.width,
      height: canvas.height
    });
  }

  await pdf.destroy();

  return {
    pageCount: pdf.numPages,
    pages
  };
}
