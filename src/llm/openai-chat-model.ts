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
 * Streaming:
 *   `invokeStream()` parses SSE chunks and yields `StreamChunk` objects.
 *   Supports `reasoning_content` (DeepSeek R1 style),
 *   incremental `tool_calls` (accumulated until stream end), and `usage` on the final chunk.
 *
 * Works with: OpenAI, DeepSeek, MiniMax, Kimi (Moonshot), GLM (Zhipu), etc.
 * Used by: `src/llm/factory.ts` when `apiFramework === "openai"`
 */
import type { ChatCompletionParams, ChatCompletionResult, ChatModel, StreamChunk, TokenUsage, ToolCall, ToolDefinition } from "../types/index.js";
import { AIMessage, BaseMessage, HumanMessage, SystemMessage } from "../types/messages.js";

/**
 * Lightweight SSE line parser for OpenAI streaming responses.
 *
 * Returns an async generator of parsed SSE `data` lines (as strings).
 * Skips lines starting with `:` (comments), handles `data: [DONE]`.
 */
async function* sseIterator(reader: ReadableStreamDefaultReader<Uint8Array>): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? ""; // keep incomplete line in buffer

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed === "" || trimmed.startsWith(":")) continue;
        if (trimmed === "data: [DONE]") return;
        if (trimmed.startsWith("data: ")) {
          yield trimmed.slice(6);
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export class OpenAIChatModel implements ChatModel {
  private apiKey: string;
  private endpoint: string;
  public modelName: string;
  public temperature: number;
  public contextWindow: number;

  /** AbortController for the current stream — allows cancelling mid-stream */
  private currentAbortController: AbortController | null = null;

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
        reasoning_content?: string | null;
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
    const reasoningContent = choice.message.reasoning_content || undefined;
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
      reasoningContent,
    };
  }

  /**
   * Stream a chat completion, yielding incremental chunks as they arrive.
   *
   * Uses the OpenAI `stream: true` SSE mode. Yields `reasoning`, `text`,
   * `tool_call`, and `done` chunk types.
   *
   * For tool calls: incremental deltas are accumulated within each stream chunk
   * because the OpenAI API may split a single tool call across multiple delta
   * lines. The final `tool_call` chunk contains fully assembled tool calls.
   */
  async *invokeStream(params: ChatCompletionParams): AsyncGenerator<StreamChunk> {
    const url = `${this.endpoint}/chat/completions`;

    const body: Record<string, unknown> = {
      model: this.modelName,
      messages: this.formatMessages(params.messages),
      temperature: params.temperature ?? this.temperature,
      max_tokens: params.maxTokens ?? 4096,
      stream: true,
      // Ask for usage in the final chunk (supported by many providers)
      stream_options: { include_usage: true },
    };

    if (params.system) {
      (body.messages as unknown[]).unshift({
        role: "system",
        content: params.system,
      });
    }

    if (params.tools && params.tools.length > 0) {
      body.tools = this.formatTools(params.tools);
      body.tool_choice = "auto";
    }

    this.currentAbortController = new AbortController();

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: this.currentAbortController.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `[${this.modelName}] API error ${response.status}: ${errorText}`
      );
    }

    if (!response.body) {
      throw new Error(`[${this.modelName}] No response body for streaming`);
    }

    const reader = response.body.getReader();

    // Accumulate text content (may appear before tool calls)
    let accumulatedText = "";

    // Accumulate tool calls across multiple delta chunks
    // Keyed by index (as string) to handle parallel tool calls
    const accumulatedToolCalls: Map<string, {
      id: string;
      name: string;
      arguments: string;
    }> = new Map();
    // Track the newest tool call index we're still building
    let latestToolCallIndex = -1;

    try {
      for await (const rawLine of sseIterator(reader)) {
        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(rawLine);
        } catch {
          // Malformed JSON line — skip
          continue;
        }

        const choices = parsed.choices as Array<{
          delta: Record<string, unknown>;
          finish_reason?: string | null;
        }> | undefined;

        if (!choices || choices.length === 0) {
          // Some providers send usage outside choices in the final chunk
          if ((parsed.usage as Record<string, number> | undefined) != null) {
            const u = parsed.usage as { prompt_tokens: number; completion_tokens: number; total_tokens: number };
            yield {
              type: "done",
              usage: {
                inputTokens: u.prompt_tokens,
                outputTokens: u.completion_tokens,
                totalTokens: u.total_tokens,
              },
            };
          }
          continue;
        }

        const delta = choices[0].delta as {
          content?: string | null;
          reasoning_content?: string | null;
          tool_calls?: Array<{
            index: number;
            id?: string;
            type?: string;
            function?: { name?: string; arguments?: string };
          }>;
        };

        // Reasoning content (e.g. DeepSeek R1)
        if (delta.reasoning_content) {
          yield { type: "reasoning", delta: delta.reasoning_content };
        }

        // Incremental text content
        if (delta.content) {
          accumulatedText += delta.content;
          yield { type: "text", delta: delta.content };
        }

        // Incremental tool calls
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const key = String(tc.index);
            if (tc.id) {
              // New tool call starting
              accumulatedToolCalls.set(key, {
                id: tc.id,
                name: tc.function?.name ?? "",
                arguments: tc.function?.arguments ?? "",
              });
              if (tc.index > latestToolCallIndex) latestToolCallIndex = tc.index;
            } else {
              // Continuation of an existing tool call
              const existing = accumulatedToolCalls.get(key);
              if (existing) {
                if (tc.function?.name) existing.name += tc.function.name;
                if (tc.function?.arguments) existing.arguments += tc.function.arguments;
              }
            }
          }
        }

        // If finish_reason is present, this is the final chunk (may also carry usage)
        const finishReason = choices[0].finish_reason;
        if (finishReason) {
          // Build the final tool calls from accumulated data
          let finalToolCalls: ToolCall[] | undefined;
          if (accumulatedToolCalls.size > 0) {
            finalToolCalls = [];
            // Sort by index to preserve order
            const sortedIndices = Array.from(accumulatedToolCalls.keys())
              .map(Number)
              .sort((a, b) => a - b);
            for (const idx of sortedIndices) {
              const tc = accumulatedToolCalls.get(String(idx))!;
              finalToolCalls.push({
                id: tc.id,
                name: tc.name,
                arguments: tc.arguments
                  ? (JSON.parse(tc.arguments) as Record<string, unknown>)
                  : {},
              });
            }
          }

          let usage: TokenUsage | undefined;
          const u = parsed.usage as { prompt_tokens: number; completion_tokens: number; total_tokens: number } | undefined;
          if (u) {
            usage = {
              inputTokens: u.prompt_tokens,
              outputTokens: u.completion_tokens,
              totalTokens: u.total_tokens,
            };
          }

          // If there are tool calls, emit a tool_call chunk with accumulated text
          if (finalToolCalls && finalToolCalls.length > 0) {
            yield {
              type: "tool_call",
              delta: accumulatedText || undefined,
              toolCalls: finalToolCalls,
            };
          }

          yield { type: "done", usage };
          return;
        }
      }
    } finally {
      this.currentAbortController = null;
      reader.releaseLock();
    }

    // If we exhausted the stream without a finish_reason, emit done anyway
    yield { type: "done" };
  }
}