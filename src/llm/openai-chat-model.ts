/**
 * OpenAI-compatible chat model implementation.
 *
 * Wraps any OpenAI-compatible /v1/chat/completions API into the common ChatModel
 * interface. Handles system prompt injection as a system message, native function
 * calling via tool_calls, and multi-turn conversation.
 *
 * Exports:
 * - `OpenAIChatModel` — class implementing `ChatModel` via OpenAI-compatible APIs
 *
 * Works with: OpenAI, DeepSeek, MiniMax, Kimi (Moonshot), GLM (Zhipu), etc.
 * Used by: `src/llm/factory.ts` when `apiFramework === "openai"`
 */
import { HumanMessage, AIMessage, SystemMessage, BaseMessage } from "../types/messages.js";
import type { ChatCompletionParams, ChatCompletionResult, TokenUsage, ToolCall, ToolDefinition, ChatModel } from "../types/index.js";

export class OpenAIChatModel implements ChatModel {
  private apiKey: string;
  private endpoint: string;
  public modelName: string;
  public temperature: number;
  public contextWindow: number;

  constructor(config: {
    apiKey: string;
    endpoint: string;
    model: string;
    temperature?: number;
    contextWindow?: number;
  }) {
    this.apiKey = config.apiKey;
    this.endpoint = config.endpoint;
    this.modelName = config.model;
    this.temperature = config.temperature ?? 0;
    this.contextWindow = config.contextWindow ?? 128000;
  }

  /**
   * Convert our BaseMessage[] → OpenAI API message format.
   * (role + string content only for now; no multi-modal support.)
   */
  private formatMessages(
    messages: BaseMessage[]
  ): Array<{ role: "system" | "user" | "assistant"; content: string }> {
    return messages.map((msg) => {
      const content =
        typeof msg.content === "string"
          ? msg.content
          : JSON.stringify(msg.content);
      if (msg instanceof SystemMessage) return { role: "system" as const, content };
      if (msg instanceof HumanMessage) return { role: "user" as const, content };
      if (msg instanceof AIMessage) return { role: "assistant" as const, content };
      return { role: "user" as const, content };
    });
  }

  /**
   * Convert our ToolDefinition[] → OpenAI tools[] format.
   */
  private formatTools(tools: ToolDefinition[]): Array<{
    type: "function";
    function: {
      name: string;
      description: string;
      parameters: ToolDefinition["input_schema"];
    };
  }> {
    return tools.map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.input_schema,
      },
    }));
  }

  /**
   * Parse OpenAI tool_calls[] response → our ToolCall[].
   */
  private parseToolCalls(
    rawCalls: Array<{
      id: string;
      type: string;
      function: { name: string; arguments: string };
    }> | undefined
  ): ToolCall[] {
    if (!rawCalls) return [];
    return rawCalls
      .filter((tc) => tc.type === "function")
      .map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments) as Record<string, unknown>,
      }));
  }

  /**
   * Invoke the model with full chat completion parameters.
   *
   * This mirrors the Anthropic API shape used by Claude Code:
   *   client.messages.create({ model, system, messages, tools, max_tokens })
   */
  async invoke(params: ChatCompletionParams): Promise<ChatCompletionResult> {
    const url = `${this.endpoint}/chat/completions`;

    const body: Record<string, unknown> = {
      model: this.modelName,
      messages: this.formatMessages(params.messages),
      temperature: params.temperature ?? this.temperature,
      max_tokens: params.maxTokens ?? 4096, // TODO: make this configurable
    };

    // If a system prompt is provided, prepend it as a system message
    // (OpenAI API doesn't have a top-level 'system' field; we inline it.)
    if (params.system) {
      (body.messages as unknown[]).unshift({
        role: "system",
        content: params.system,
      });
    }

    // If tools are provided, add them in native OpenAI function-calling format
    if (params.tools && params.tools.length > 0) {
      body.tools = this.formatTools(params.tools);
      // Make sure tool_choice is "auto" so the model can decide
      body.tool_choice = "auto";
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `[${this.modelName}] API error ${response.status}: ${errorText}`
      );
    }

    interface OpenAIChoice {
      message: {
        content: string | null;
        tool_calls?: Array<{
          id: string;
          type: string;
          function: { name: string; arguments: string };
        }>;
      };
    }

    interface OpenAIUsage {
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
    }

    const data = (await response.json()) as {
      choices: OpenAIChoice[];
      usage?: OpenAIUsage;
    };

    const choice = data.choices?.[0];
    if (!choice) {
      throw new Error(`[${this.modelName}] API returned no choices`);
    }

    const content = choice.message.content || ' ';
    const toolCalls = this.parseToolCalls(choice.message.tool_calls);

    let usage: TokenUsage | undefined;
    if (data.usage) {
      usage = {
        inputTokens: data.usage.prompt_tokens,
        outputTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      };
    }

    return {
      message: new AIMessage(content),
      toolCalls,
      usage,
    };
  }
}