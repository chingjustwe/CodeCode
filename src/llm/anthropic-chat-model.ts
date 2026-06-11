/**
 * Anthropic API chat model implementation.
 *
 * Wraps the Anthropic Messages API (POST /v1/messages) into the common ChatModel
 * interface, handling the Anthropic-specific message format, system prompt,
 * tool_use content blocks, and stop_reason parsing.
 *
 * Exports:
 * - `AnthropicChatModel` — class implementing `ChatModel` via the Anthropic API
 *
 * Streaming:
 *   `invokeStream()` parses Anthropic SSE events and yields `StreamChunk` objects.
 *   Supports `thinking` content blocks, incremental text, incremental tool_use
 *   partial JSON, and usage in the `message_stop` event.
 *
 * Used by: `src/llm/factory.ts` when `apiFramework === "anthropic"`
 */
import type { ChatCompletionParams, ChatCompletionResult, ChatModel, StreamChunk, TokenUsage, ToolCall } from "../types/index.js";
import { AIMessage, BaseMessage, HumanMessage } from "../types/messages.js";

/**
 * Lightweight SSE line parser for Anthropic streaming responses.
 *
 * Anthropic SSE events look like:
 *   event: message_start
 *   data: {...}
 *
 * Returns an async generator of { event, data } objects.
 */
async function* anthropicSSEIterator(reader: ReadableStreamDefaultReader<Uint8Array>): AsyncGenerator<{ event: string; data: string }> {
  const decoder = new TextDecoder();
  let buffer = "";
  let currentEvent = "";
  let currentData = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed === "") {
          // Empty line = end of an event
          if (currentEvent) {
            yield { event: currentEvent, data: currentData };
          }
          currentEvent = "";
          currentData = "";
          continue;
        }
        if (trimmed.startsWith("event: ")) {
          currentEvent = trimmed.slice(7);
        } else if (trimmed.startsWith("data: ")) {
          currentData = trimmed.slice(6);
        }
        // Ignore other lines (e.g. comments starting with ":")
      }
    }

    // Flush any remaining event
    if (currentEvent) {
      yield { event: currentEvent, data: currentData };
    }
  } finally {
    reader.releaseLock();
  }
}

export class AnthropicChatModel implements ChatModel {
  private apiKey: string;
  private endpoint: string;
  public modelName: string;
  public temperature: number;
  public contextWindow: number;

  /** Anthropic API version header value */
  private apiVersion: string;

  /** AbortController for the current stream — allows cancelling mid-stream */
  private currentAbortController: AbortController | null = null;

  constructor(config: {
    apiKey: string;
    endpoint: string;
    model: string;
    temperature?: number;
    contextWindow?: number;
    apiVersion?: string;
  }) {
    this.apiKey = config.apiKey;
    this.endpoint = config.endpoint;
    this.modelName = config.model;
    this.temperature = config.temperature ?? 0;
    this.contextWindow = config.contextWindow ?? 200000;
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
      thinking?: string;
    }>;
    stop_reason?: string;
    usage?: {
      input_tokens: number;
      output_tokens: number;
    };
  }): ChatCompletionResult {
    // Extract text content
    const textBlocks = data.content.filter((c) => c.type === "text");
    const textContent = textBlocks.map((b) => b.text || " ").join("");

    // Extract thinking/reasoning content (type: "thinking")
    const thinkingBlock = data.content.find((c) => c.type === "thinking");
    const reasoningContent = thinkingBlock?.thinking;

    // Extract tool calls
    const toolCalls: ToolCall[] = data.content
      .filter((c) => c.type === "tool_use")
      .map((c) => ({
        id: c.id ?? "",
        name: c.name ?? "",
        arguments: c.input ?? {},
      }));

    let usage: TokenUsage | undefined;
    if (data.usage) {
      usage = {
        inputTokens: data.usage.input_tokens,
        outputTokens: data.usage.output_tokens,
        totalTokens: data.usage.input_tokens + data.usage.output_tokens,
      };
    }

    return {
      message: new AIMessage(textContent),
      toolCalls,
      usage,
      reasoningContent,
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
        thinking?: string;
      }>;
      stop_reason?: string;
      usage?: {
        input_tokens: number;
        output_tokens: number;
      };
    };

    return this.parseResponse(data);
  }

  /**
   * Stream a chat completion via the Anthropic SSE API.
   *
   * Anthropic streaming sends SSE events such as:
   *   message_start, content_block_start, content_block_delta,
   *   content_block_stop, message_delta, message_stop, ping
   *
   * This method parses each event and yields StreamChunk objects
   * for text, reasoning, tool_call, and done.
   */
  async *invokeStream(params: ChatCompletionParams): AsyncGenerator<StreamChunk> {
    const url = `${this.endpoint}/messages`;

    const body: Record<string, unknown> = {
      model: this.modelName,
      messages: this.formatMessages(params.messages),
      max_tokens: params.maxTokens ?? 4096,
      stream: true,
    };

    if (params.temperature !== undefined) {
      body.temperature = params.temperature;
    }

    if (params.system) {
      body.system = params.system;
    }

    if (params.tools && params.tools.length > 0) {
      body.tools = params.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.input_schema,
      }));
    }

    this.currentAbortController = new AbortController();

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": this.apiVersion,
      },
      body: JSON.stringify(body),
      signal: this.currentAbortController.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `[${this.modelName}] Anthropic API error ${response.status}: ${errorText}`
      );
    }

    if (!response.body) {
      throw new Error(`[${this.modelName}] No response body for streaming`);
    }

    const reader = response.body.getReader();

    // Accumulated state across events
    let accumulatedText = "";
    let currentBlockIndex = 0;
    // Map of block_index → { id, name, arguments (partial) } for tool_use blocks
    const accumulatedToolCalls: Map<number, {
      id: string;
      name: string;
      arguments: string;
    }> = new Map();
    // Which blocks we've seen start events for
    const seenBlockStarts = new Set<string>(); // "type@index"

    let usage: TokenUsage | undefined;

    try {
      for await (const { event, data } of anthropicSSEIterator(reader)) {
        if (!data) continue;

        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(data);
        } catch {
          continue;
        }

        switch (event) {
          case "message_start": {
            const msg = parsed as {
              message?: {
                usage?: { input_tokens: number; output_tokens: number };
              };
            };
            if (msg.message?.usage) {
              usage = {
                inputTokens: msg.message.usage.input_tokens,
                outputTokens: msg.message.usage.output_tokens,
                totalTokens: msg.message.usage.input_tokens + msg.message.usage.output_tokens,
              };
            }
            break;
          }

          case "content_block_start": {
            const block = parsed as {
              index: number;
              content_block: {
                type: string;
                text?: string;
                id?: string;
                name?: string;
                thinking?: string;
              };
            };
            currentBlockIndex = block.index;
            const blockKey = `${block.content_block.type}@${block.index}`;
            seenBlockStarts.add(blockKey);

            if (block.content_block.type === "thinking" && block.content_block.thinking) {
              // Anthropic sends full thinking content in content_block_start
              yield { type: "reasoning", delta: block.content_block.thinking };
            } else if (block.content_block.type === "text" && block.content_block.text) {
              accumulatedText += block.content_block.text;
              yield { type: "text", delta: block.content_block.text };
            } else if (block.content_block.type === "tool_use") {
              accumulatedToolCalls.set(block.index, {
                id: block.content_block.id ?? "",
                name: block.content_block.name ?? "",
                arguments: "", // will be filled via content_block_delta
              });
            }
            break;
          }

          case "content_block_delta": {
            const delta = parsed as {
              index: number;
              delta: {
                type: string;
                text?: string;
                thinking?: string;
                partial_json?: string;
              };
            };

            if (delta.delta.type === "text" && delta.delta.text) {
              accumulatedText += delta.delta.text;
              yield { type: "text", delta: delta.delta.text };
            } else if (delta.delta.type === "thinking" && delta.delta.thinking) {
              yield { type: "reasoning", delta: delta.delta.thinking };
            } else if (delta.delta.type === "input_json_delta" && delta.delta.partial_json) {
              // Anthropic sends partial JSON for tool_use block arguments
              const existing = accumulatedToolCalls.get(delta.index);
              if (existing) {
                existing.arguments += delta.delta.partial_json;
              }
            }
            break;
          }

          case "content_block_stop": {
            // No action needed — tool calls are finalized at message_stop
            break;
          }

          case "message_delta": {
            const msgDelta = parsed as {
              delta?: { stop_reason?: string; stop_sequence?: string | null };
              usage?: { input_tokens: number; output_tokens: number };
            };
            if (msgDelta.usage) {
              usage = {
                inputTokens: msgDelta.usage.input_tokens,
                outputTokens: msgDelta.usage.output_tokens,
                totalTokens: msgDelta.usage.input_tokens + msgDelta.usage.output_tokens,
              };
            }
            if (msgDelta.delta?.stop_reason === "tool_use") {
              // Finalize and emit tool calls
              const finalToolCalls: ToolCall[] = [];
              const sortedIndices = Array.from(accumulatedToolCalls.keys()).sort((a, b) => a - b);
              for (const idx of sortedIndices) {
                const tc = accumulatedToolCalls.get(idx)!;
                finalToolCalls.push({
                  id: tc.id,
                  name: tc.name,
                  arguments: tc.arguments
                    ? (JSON.parse(tc.arguments) as Record<string, unknown>)
                    : {},
                });
              }

              yield {
                type: "tool_call",
                delta: accumulatedText || undefined,
                toolCalls: finalToolCalls,
              };
            }
            break;
          }

          case "message_stop": {
            yield { type: "done", usage };
            return;
          }

          // "ping" events are heartbeats — ignore
          default:
            break;
        }
      }
    } finally {
      this.currentAbortController = null;
      reader.releaseLock();
    }

    // If we exhausted the stream without message_stop
    yield { type: "done", usage };
  }
}