export type ExtractedThinking = {
  content: string;
  thinking?: string;
};

export function extractThinking(raw: string): ExtractedThinking {
  const thinkingBlocks: string[] = [];
  const content = raw
    .replace(/<thinking>([\s\S]*?)<\/thinking>/gi, (_match, thinking) => {
      const trimmed = String(thinking).trim();
      if (trimmed) {
        thinkingBlocks.push(trimmed);
      }
      return "";
    })
    .trim();

  return {
    content,
    thinking: thinkingBlocks.length > 0 ? thinkingBlocks.join("\n\n") : undefined
  };
}
