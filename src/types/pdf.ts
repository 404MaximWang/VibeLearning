export type PdfPage = {
  pageNumber: number;
  title: string;
  status: "not_started" | "in_progress" | "completed";
  accent: "mint" | "amber" | "rose" | "blue";
  imageDataUrl?: string;
  width?: number;
  height?: number;
};

export type PdfDocument = {
  id: string;
  name: string;
  size: number;
  objectUrl: string;
};
