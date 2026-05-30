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
  },
  deepseek: {
    endpoint: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
    envKey: "DEEPSEEK_API_KEY",
    apiFramework: "openai",
  },
  minimax: {
    endpoint: "https://api.minimax.chat/v1",
    defaultModel: "MiniMax-M2.5",
    envKey: "MINIMAX_API_KEY",
    apiFramework: "openai",
  },
  kimi: {
    // Kimi (Moonshot) uses an OpenAI-compatible API
    endpoint: "https://api.moonshot.cn/v1",
    defaultModel: "moonshot-v1-8k",
    envKey: "KIMI_API_KEY",
    apiFramework: "openai",
  },
  anthropic: {
    endpoint: "https://api.anthropic.com/v1",
    defaultModel: "claude-sonnet-4-20250514",
    envKey: "ANTHROPIC_API_KEY",
    apiFramework: "anthropic",
  },
  // "claude" is an alias for "anthropic"
  claude: {
    endpoint: "https://api.anthropic.com/v1",
    defaultModel: "claude-sonnet-4-20250514",
    envKey: "ANTHROPIC_API_KEY",
    apiFramework: "anthropic",
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