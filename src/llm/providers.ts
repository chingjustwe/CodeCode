/**
 * Provider configuration registry — maps provider names to their API endpoint,
 * default model, environment variable key, and API framework type.
 *
 * Exports:
 * - `PROVIDERS` — readonly record of all provider configs
 * - `listProviders()` — returns all registered provider names
 * - `getProvider(name)` — looks up a provider config, throws if unknown
 *
 * Used by: `src/llm/factory.ts` to instantiate the correct ChatModel
 */
import { ProviderConfig } from "../types/index.js";

/**
 * Provider configurations.
 * Each entry maps a short name (e.g. "openai") to its API endpoint,
 * default model, environment variable, and API framework type.
 *
 * See:
 *   - openai:  POST /v1/chat/completions
 *   - anthropic: POST /v1/messages
 */
export const PROVIDERS: Record<string, ProviderConfig> = {
  openai: {
    endpoint: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    envKey: "OPENAI_API_KEY",
    apiFramework: "openai",
    contextWindow: 128000,
  },
  deepseek: {
    endpoint: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
    envKey: "DEEPSEEK_API_KEY",
    apiFramework: "openai",
    contextWindow: 128000,
  },
  minimax: {
    endpoint: "https://api.minimax.chat/v1",
    defaultModel: "MiniMax-M2.5",
    envKey: "MINIMAX_API_KEY",
    apiFramework: "openai",
    contextWindow: 128000,
  },
  glm: {
    // GLM (Zhipu AI) uses an OpenAI-compatible API
    endpoint: "https://open.bigmodel.cn/api/paas/v4",
    defaultModel: "glm-4-plus",
    envKey: "GLM_API_KEY",
    apiFramework: "openai",
    contextWindow: 128000,
  },
  kimi: {
    // Kimi (Moonshot) uses an OpenAI-compatible API
    endpoint: "https://api.moonshot.cn/v1",
    defaultModel: "kimi-k2.5",
    envKey: "KIMI_API_KEY",
    apiFramework: "openai",
    temperature: 1, // Kimi's models are often better with a bit more temperature
    contextWindow: 128000,
  },
  anthropic: {
    endpoint: "https://api.anthropic.com/v1",
    defaultModel: "claude-sonnet-4-20250514",
    envKey: "ANTHROPIC_API_KEY",
    apiFramework: "anthropic",
    contextWindow: 200000,
  },
  // "claude" is an alias for "anthropic"
  claude: {
    endpoint: "https://api.anthropic.com/v1",
    defaultModel: "claude-sonnet-4-20250514",
    envKey: "ANTHROPIC_API_KEY",
    apiFramework: "anthropic",
    contextWindow: 200000,
  },
};

/** Return the list of registered provider names */
export function listProviders(): string[] {
  return Object.keys(PROVIDERS);
}

/** Look up a provider config by name; throws if unknown */
export function getProvider(name: string): ProviderConfig {
  const provider = PROVIDERS[name];
  if (!provider) {
    throw new Error(
      `Unknown provider "${name}". Available: ${listProviders().join(", ")}`
    );
  }
  return provider;
}