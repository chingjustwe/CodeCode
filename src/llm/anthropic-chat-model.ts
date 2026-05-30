import { HumanMessage, AIMessage, BaseMessage } from "../types/messages.js";
import type { ChatCompletionParams, ChatCompletionResult, ToolCall, ChatModel } from "../types/index.js";

/**
 * Anthropic-compatible chat model.
 *
 * Calls POST /v1/messages (the Anthropic API format).
 *
 * Key differences from OpenAI:
 *   - system prompt is a top-level field, not inside messages[]
 *   - tool calls are content[] items with type "tool_use", not a separate field
 *   - tool parameters field is called "input", not "arguments"
 *   - stop_reason tells us why generation stopped ("end_turn" vs "tool_use")
 */
export class AnthropicChatModel implements ChatModel {
  private apiKey: string;
  private endpoint: string;
  public modelName: string;
  public temperature: number;

  /** Anthropic API version header value */
  private apiVersion: string;

  constructor(config: {
    apiKey: string;
    endpoint: string;
    model: string;
    temperature?: number;
    apiVersion?: string;
  }) {
    this.apiKey = config.apiKey;
    this.endpoint = config.endpoint;
    this.modelName = config.model;
    this.temperature = config.temperature ?? 0;
    this.apiVersion = config.apiVersion ?? "2023-06-01";
  }

  /**
   * Convert our BaseMessage[] → Anthropic API message format.
   *
   * Anthropic messages shape:
   *   { role: "user" | "assistant", content: string }
   * System prompt is NOT inside this array — it's a separate top-level field.
   */
  private formatMessages(
    messages: BaseMessage[]
  ): Array<{ role: "user" | "assistant"; content: string }> {
    return messages
      .filter((msg) => !(msg instanceof HumanMessage === false && false)) // keep all
      .map((msg) => {
        const content =
          typeof msg.content === "string"
            ? msg.content
            : JSON.stringify(msg.content);

        // Anthropic does NOT put system messages in the messages array
        if (msg instanceof HumanMessage) {
          return { role: "user" as const, content };
        }
        // AIMessage that represents a tool call result should have
        // the content from the model
        if (msg instanceof AIMessage) {
          return { role: "assistant" as const, content };
        }
        // Fallback: treat as user
        return { role: "user" as const, content };
      });
  }

  /**
   * Parse Anthropic API response → our ChatCompletionResult.
   *
   * Anthropic response shape:
   * {
   *   content: [
   *     { type: "text", text: "..." },
   *     { type: "tool_use", id: "toolu_xxx", name: "calculate", input: {...} }
   *   ],
   *   stop_reason: "end_turn" | "tool_use" | "max_tokens"
   * }
   */
  private parseResponse(data: {
    content: Array<{
      type: string;
      text?: string;
      id?: string;
      name?: string;
      input?: Record<string, unknown>;
    }>;
    stop_reason?: string;
  }): ChatCompletionResult {
    // Extract text content
    const textBlocks = data.content.filter((c) => c.type === "text");
    const textContent = textBlocks.map((b) => b.text ?? "").join("");

    // Extract tool calls
    const toolCalls: ToolCall[] = data.content
      .filter((c) => c.type === "tool_use")
      .map((c) => ({
        id: c.id ?? "",
        name: c.name ?? "",
        arguments: c.input ?? {},
      }));

    return {
      message: new AIMessage(textContent),
      toolCalls,
    };
  }

  /**
   * Invoke the Anthropic API.
   *
   * Mirrors the Anthropic Python SDK:
   *   client.messages.create({ model, system, messages, tools, max_tokens })
   */
  async invoke(params: ChatCompletionParams): Promise<ChatCompletionResult> {
    const url = `${this.endpoint}/messages`;

    // Build the request body in Anthropic format
    const body: Record<string, unknown> = {
      model: this.modelName,
      messages: this.formatMessages(params.messages),
      max_tokens: params.maxTokens ?? 4096,
    };

    if (params.temperature !== undefined) {
      body.temperature = params.temperature;
    }

    // Anthropic has a top-level "system" field (not inside messages[])
    if (params.system) {
      body.system = params.system;
    }

    // Anthropic tool format doesn't have type: "function" wrapper
    if (params.tools && params.tools.length > 0) {
      body.tools = params.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.input_schema,
      }));
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": this.apiVersion,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `[${this.modelName}] Anthropic API error ${response.status}: ${errorText}`
      );
    }

    const data = (await response.json()) as {
      content: Array<{
        type: string;
        text?: string;
        id?: string;
        name?: string;
        input?: Record<string, unknown>;
      }>;
      stop_reason?: string;
    };

    return this.parseResponse(data);
  }
}