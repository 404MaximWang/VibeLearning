export type LlmProviderConfig = {
  provider: "openai_compatible";
  baseUrl: string;
  apiKey: string;
  model: string;
  enabled: boolean;
};

const storageKey = "vibelearning.llmConfig.v1";

export const defaultLlmConfig: LlmProviderConfig = {
  provider: "openai_compatible",
  baseUrl: "https://api.openai.com/v1",
  apiKey: "",
  model: "gpt-4o",
  enabled: false
};

export function loadLlmConfig(): LlmProviderConfig {
  const raw = window.localStorage.getItem(storageKey);

  if (!raw) {
    return { ...defaultLlmConfig };
  }

  try {
    return {
      ...defaultLlmConfig,
      ...JSON.parse(raw)
    };
  } catch {
    return { ...defaultLlmConfig };
  }
}

export function saveLlmConfig(config: LlmProviderConfig) {
  window.localStorage.setItem(storageKey, JSON.stringify(config));
}

export function hasUsableLlmConfig(config: LlmProviderConfig) {
  return (
    config.enabled &&
    config.baseUrl.trim().length > 0 &&
    config.apiKey.trim().length > 0 &&
    config.model.trim().length > 0
  );
}
