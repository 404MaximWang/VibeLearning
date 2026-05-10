import { computed, ref } from "vue";
import {
  defaultLlmConfig,
  hasUsableLlmConfig,
  loadLlmConfig,
  saveLlmConfig,
  type LlmProviderConfig
} from "../services/llmConfig";

type UseLlmSettingsOptions = {
  onPersist?: (config: LlmProviderConfig, ready: boolean) => void;
};

export function useLlmSettings(options: UseLlmSettingsOptions = {}) {
  const llmConfig = ref<LlmProviderConfig>(loadLlmConfig());
  const showSettings = ref(false);
  const llmReady = computed(() => hasUsableLlmConfig(llmConfig.value));

  function persistLlmConfig() {
    saveLlmConfig(llmConfig.value);
    showSettings.value = false;
    options.onPersist?.(llmConfig.value, llmReady.value);
  }

  function resetLlmConfig() {
    llmConfig.value = { ...defaultLlmConfig };
    saveLlmConfig(llmConfig.value);
  }

  return {
    llmConfig,
    llmReady,
    persistLlmConfig,
    resetLlmConfig,
    showSettings
  };
}
