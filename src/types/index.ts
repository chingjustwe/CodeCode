/**
 * Central type definitions for the entire project.
 *
 * Re-exports from `./messages.js`:
 * - `BaseMessage`, `HumanMessage`, `AIMessage`, `SystemMessage` — message classes
 *
 * Defines shared interfaces/types used across all layers (LLM, agent, tools):
 * - `ApiFramework`, `ProviderConfig` — LLM provider configuration
 * - `ToolParameterProperty`, `ToolDefinition`, `ToolCall`, `Tool` — tool system
 * - `TokenUsage` — token usage statistics from LLM API calls
 * - `ChatCompletionParams`, `ChatCompletionResult`, `ChatModel` — model abstraction
 * - `AgentResult` — agent loop output
 *
 * Used by: virtually every module in the project
 */
import {
  BaseMessage,
  HumanMessage,
  AIMessage,
  SystemMessage,
} from "./messages.js";

export type { BaseMessage, HumanMessage, AIMessage, SystemMessage };

/** Which API framework this provider uses */
export type ApiFramework = "openai" | "anthropic";

/** Token usage statistics from an LLM API call */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

/** Configuration for a single LLM provider */
export interface ProviderConfig {
  endpoint: string;
  defaultModel: string;
  envKey: string;
  apiFramework: ApiFramework;
  temperature?: number;
  contextWindow?: number;
}

/**
 * JSON Schema definition for a tool parameter (OpenAI function calling format).
 */
export interface ToolParameterProperty {
  type: string;
  description?: string;
  enum?: string[];
  items?: ToolParameterProperty;
  properties?: Record<string, ToolParameterProperty>;
  required?: string[];
}

/**
 * A tool definition with JSON schema, matching the OpenAI / Anthropic tool format.
 * This is what gets passed to the API as native tool calling.
 */
export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, ToolParameterProperty>;
    required?: string[];
  };
}

/**
 * A tool call returned by the model (native function calling).
 */
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/**
 * Parameters for model.invoke(), mirroring the Anthropic/OpenAI API shape.
 */
export interface ChatCompletionParams {
  system?: string;
  messages: BaseMessage[];
  tools?: ToolDefinition[];
  maxTokens?: number;
  temperature?: number;
}

/**
 * Result from model.invoke(), including both the assistant message and any tool calls.
 */
export interface ChatCompletionResult {
  message: AIMessage;
  toolCalls: ToolCall[];
  usage?: TokenUsage;
  reasoningContent?: string;
}

/**
 * A tool implementation (runtime callable, not just schema).
 */
export interface Tool {
  definition: ToolDefinition;
  fn: (...args: unknown[]) => string | Promise<string>;
}

/** Result returned from one agent loop iteration */
export interface AgentResult {
  answer: string;
  history: BaseMessage[];
}

/**
 * Shared interface for all chat models (OpenAI / Anthropic / etc.).
 * The agent loop only depends on this interface, not on any specific class.
 */
export interface ChatModel {
  modelName: string;
  contextWindow: number;
  invoke(params: ChatCompletionParams): Promise<ChatCompletionResult>;
}
