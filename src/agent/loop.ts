/**
 * Core agent reasoning loop. Iterates up to MAX_ITERATIONS rounds, each
 * time: building context from message history, invoking the LLM with
 * streaming output, handling any tool calls, and feeding results back as
 * HumanMessages. Ends when the model responds without tool calls or when
 * the iteration limit is reached.
 *
 * Exports:
 * - `agentLoop(userInput, model, toolsRegistry, messageHistory?)` — main entry point
 *   Returns `AgentResult` with `answer` and `history`.
 *
 * Streaming:
 *   Uses `model.invokeStream()` for character-by-character output display.
 *   Reasoning content (e.g. DeepSeek R1 thinking) is printed as it arrives.
 *   Tool calls are accumulated during streaming and processed in the loop body.
 *
 * Dependencies:
 * - `./prompt.ts` — builds the system prompt (includes skill descriptions)
 * - `./tools/tool-registry.ts` — tool lookup by name
 * - `./hooks.ts` — LoopListener lifecycle hooks
 * - `../types/messages.ts` — BaseMessage / HumanMessage / AIMessage
 * - `../types/index.ts` — ChatModel, AgentResult, StreamChunk, Tool types
 */
import { AgentResult, ChatModel, StreamChunk, ToolCall } from "../types/index.js";
import { AIMessage, BaseMessage, HumanMessage } from "../types/messages.js";
import type { RoundContext, ToolCallInfo } from "./hooks.js";
import {
  applyBeforeToolResultHooks,
  fireAfterModelInvokeHooks,
  fireBeforeToolCallHooks,
  fireLoopEndHooks,
  fireRoundEndHooks,
  fireRoundStartHooks
} from "./hooks.js";
import { buildSystemPrompt } from "./prompt.js";
import { ToolRegistry } from "./tools/tool-registry.js";

const MAX_ITERATIONS = 20;
const MAX_TOKENS = 8096;

async function processToolCalls(
  toolCalls: ToolCall[],
  toolsRegistry: ToolRegistry,
): Promise<{ toolCallInfos: ToolCallInfo[]; toolMessages: HumanMessage[] }> {
  const toolCallInfos: ToolCallInfo[] = [];
  const toolMessages: HumanMessage[] = [];

  for (const toolCall of toolCalls) {
    const tool = toolsRegistry.get(toolCall.name);

    if (!tool) {
      console.log(`  ⚠️  Unknown tool: "${toolCall.name}"`);
      toolCallInfos.push({ name: toolCall.name, success: false });
      toolMessages.push(
        new HumanMessage(
          `Error: Tool "${toolCall.name}" not found. Available: ${toolsRegistry.list().join(", ")}.`
        )
      );
      continue;
    }

    const { allowed, reason } = await fireBeforeToolCallHooks(toolCall.name, toolCall.arguments);
    if (!allowed) {
      console.log(`  ⛔ Tool "${toolCall.name}" blocked: ${reason}`);
      toolCallInfos.push({ name: toolCall.name, success: false });
      toolMessages.push(new HumanMessage(reason));
      continue;
    }

    let success = true;
    let observation: string;
    try {
      observation = await Promise.resolve(tool.fn(toolCall.arguments));
    } catch (err: unknown) {
      success = false;
      observation = err instanceof Error ? err.message : String(err);
    }
    toolCallInfos.push({ name: toolCall.name, success });

    console.log(`  👁️ Observation: ${observation}`);

    const displayObservation = applyBeforeToolResultHooks(toolCall.id, toolCall.name, observation);

    toolMessages.push(
      new HumanMessage(
        `Tool "${toolCall.name}" returned:\n${displayObservation}`
      )
    );
  }

  return { toolCallInfos, toolMessages };
}

export async function agentLoop(
  userInput: string,
  model: ChatModel,
  toolsRegistry: ToolRegistry,
  messageHistory: BaseMessage[] = []
): Promise<AgentResult> {
  const systemPrompt = buildSystemPrompt();
  const toolDefs = toolsRegistry.definitions();

  const messages: BaseMessage[] = [
    ...messageHistory,
    new HumanMessage(userInput),
  ];

  console.log(`\n🤔 User: ${userInput}`);

  let ctx: RoundContext = { roundIndex: 0, maxRounds: MAX_ITERATIONS, messageCount: messages.length, messages, contextWindow: model.contextWindow };

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    ctx = { roundIndex: i, maxRounds: MAX_ITERATIONS, messageCount: messages.length, messages, contextWindow: model.contextWindow };

    fireRoundStartHooks(ctx, messages);

    // --- Streaming invocation ---
    const streamGen = model.invokeStream({
      system: systemPrompt,
      messages,
      tools: toolDefs,
      maxTokens: MAX_TOKENS,
    });

    // Accumulated state across stream chunks
    let accumulatedText = "";
    let toolCalls: ToolCall[] = [];
    let usage: import("../types/index.js").TokenUsage | undefined;
    let hasReasoning = false;
    let hasText = false;

    // Drive the async generator manually to capture the return value
    const iterator = streamGen[Symbol.asyncIterator]();
    let nextResult = await iterator.next();

    while (!nextResult.done) {
      const chunk: StreamChunk = nextResult.value;

      if (chunk.type === "reasoning" && chunk.delta) {
        if (!hasReasoning) {
          process.stdout.write("\n🧠 Reasoning:\n");
          hasReasoning = true;
        }
        process.stdout.write(chunk.delta);
      } else if (chunk.type === "text" && chunk.delta) {
        if (!hasText) {
          process.stdout.write("\n🤖 Assistant: ");
          hasText = true;
        }
        process.stdout.write(chunk.delta);
        accumulatedText += chunk.delta;
      } else if (chunk.type === "tool_call" && chunk.toolCalls) {
        toolCalls = chunk.toolCalls;
        if (chunk.delta) {
          accumulatedText = chunk.delta;
        }
      } else if (chunk.type === "done" && chunk.usage) {
        usage = chunk.usage;
      }

      nextResult = await iterator.next();
    }

    // Print trailing newline if we output anything
    if (hasText || hasReasoning) {
      process.stdout.write("\n");
    }

    // Fire usage hook after the stream completes
    fireAfterModelInvokeHooks(usage);

    const content = accumulatedText || ' ';

    // No tool calls → we're done
    if (toolCalls.length === 0) {
      fireLoopEndHooks(ctx);

      messageHistory.push(new HumanMessage(userInput));
      messageHistory.push(new AIMessage(content));
      return { answer: content, history: messageHistory };
    }

    // Tool calls present → add assistant message and process tools
    messages.push(new AIMessage(content));

    const { toolCallInfos, toolMessages } = await processToolCalls(toolCalls, toolsRegistry);
    messages.push(...toolMessages);

    fireRoundEndHooks(ctx, toolCallInfos);
  }

  console.log("⚠️  Max iterations reached. Ending loop.");
  fireLoopEndHooks(ctx);
  return {
    answer: "Sorry, I couldn't complete the task in time.",
    history: messageHistory,
  };
}