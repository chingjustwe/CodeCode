import "dotenv/config";
import { OpenAIChatModel } from "./openai-chat-model.js";
import { AnthropicChatModel } from "./anthropic-chat-model.js";
import { getProvider, listProviders } from "./providers.js";
import type { ChatModel, ApiFramework } from "../types/index.js";

/**
 * Create a ChatModel instance based on environment variables.
 *
 * Dispatches to the correct model class based on the provider's apiFramework:
 *   - "openai"   → OpenAIChatModel  (POST /v1/chat/completions)
 *   - "anthropic" → AnthropicChatModel (POST /v1/messages)
 *
 * Env vars:
 *   LLM_PROVIDER  — provider name (default: "anthropic")
 *   LLM_API_KEY   — fallback API key for any provider
 *   LLM_MODEL     — override the default model name
 *   {PROVIDER}_API_KEY — provider-specific key (e.g. OPENAI_API_KEY)
 */
export function createModel(): ChatModel {
  const providerName = process.env.LLM_PROVIDER ?? "anthropic";
  const provider = getProvider(providerName);

  const apiKey = process.env.LLM_API_KEY ?? process.env[provider.envKey];

  if (!apiKey) {
    throw new Error(
      `Missing API key. Set LLM_API_KEY or ${provider.envKey} environment variable.`
    );
  }

  const modelName = process.env.LLM_MODEL ?? provider.defaultModel;

  console.log(`  🔧 Model: ${providerName}/${modelName}`);

  return createModelForFramework(provider.apiFramework, {
    apiKey,
    endpoint: provider.endpoint,
    model: modelName,
    temperature: 0,
  });
}

/**
 * Dispatch to the correct ChatModel implementation based on the API framework.
 */
function createModelForFramework(
  framework: ApiFramework,
  config: { apiKey: string; endpoint: string; model: string; temperature: number }
): ChatModel {
  switch (framework) {
    case "anthropic":
      return new AnthropicChatModel(config);
    case "openai":
      return new OpenAIChatModel(config);
    default: {
      // Exhaustiveness check — if you add a new framework, TS will error here
      const _exhaustive: never = framework;
      throw new Error(`Unknown API framework: ${_exhaustive}`);
    }
  }
}

/** Print available providers to console */
export function printAvailableProviders(): void {
  console.log(`  📋 Providers: ${listProviders().join(" · ")}`);
}