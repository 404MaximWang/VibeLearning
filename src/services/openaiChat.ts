import type { LlmProviderConfig } from "./llmConfig";

type ChatMessage = {
  role: "system" | "developer" | "user" | "assistant";
  content: string;
};

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
};

function endpointFor(baseUrl: string) {
  return `${baseUrl.replace(/\/$/, "")}/chat/completions`;
}

export async function createChatCompletionJson<T>(
  config: LlmProviderConfig,
  messages: ChatMessage[]
): Promise<T> {
  const response = await fetch(endpointFor(config.baseUrl), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: 0.4,
      response_format: { type: "json_object" }
    })
  });

  const payload = (await response.json()) as ChatCompletionResponse;

  if (!response.ok) {
    throw new Error(payload.error?.message ?? `LLM request failed: ${response.status}`);
  }

  const content = payload.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("LLM response did not include message content.");
  }

  return JSON.parse(content) as T;
}

export async function createChatCompletionJsonStream<T>(
  config: LlmProviderConfig,
  messages: ChatMessage[],
  onToken: (token: string) => void
): Promise<T> {
  const response = await fetch(endpointFor(config.baseUrl), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: 0.4,
      response_format: { type: "json_object" },
      stream: true
    })
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => undefined)) as
      | ChatCompletionResponse
      | undefined;
    throw new Error(payload?.error?.message ?? `LLM request failed: ${response.status}`);
  }

  if (!response.body) {
    throw new Error("LLM response did not include a readable stream.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.startsWith("data:")) {
        continue;
      }

      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") {
        continue;
      }

      const chunk = JSON.parse(data) as {
        choices?: Array<{
          delta?: {
            content?: string;
          };
        }>;
      };
      const token = chunk.choices?.[0]?.delta?.content;
      if (token) {
        content += token;
        onToken(token);
      }
    }
  }

  if (!content) {
    throw new Error("LLM stream did not include message content.");
  }

  return JSON.parse(content) as T;
}
