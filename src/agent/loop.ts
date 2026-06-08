/**
 * Core agent reasoning loop. Iterates up to MAX_ITERATIONS rounds, each
 * time: building context from message history, invoking the LLM, handling
 * any tool calls, and feeding results back as HumanMessages. Ends when the
 * model responds without tool calls or when the iteration limit is reached.
 *
 * Exports:
 * - `agentLoop(userInput, model, toolsRegistry, messageHistory?)` — main entry point
 *   Returns `AgentResult` with `answer` and `history`.
 *
 * Dependencies:
 * - `./prompt.ts` — builds the system prompt (includes skill descriptions)
 * - `./tools/tool-registry.ts` — tool lookup by name
 * - `./hooks.ts` — LoopListener lifecycle hooks
 * - `../types/messages.ts` — BaseMessage / HumanMessage / AIMessage
 * - `../types/index.ts` — ChatModel, AgentResult, Tool types
 */
import { HumanMessage, AIMessage, BaseMessage } from "../types/messages.js";
import { AgentResult, ChatModel, ToolCall } from "../types/index.js";
import { buildSystemPrompt } from "./prompt.js";
import { ToolRegistry } from "./tools/tool-registry.js";
import {
  fireRoundStartHooks,
  fireAfterModelInvokeHooks,
  applyBeforeToolResultHooks,
  fireBeforeToolCallHooks,
  fireRoundEndHooks,
  fireLoopEndHooks,
} from "./hooks.js";
import type { ToolCallInfo, RoundContext } from "./hooks.js";

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

    const result = await model.invoke({
      system: systemPrompt,
      messages,
      tools: toolDefs,
      maxTokens: MAX_TOKENS,
    });

    fireAfterModelInvokeHooks(result.usage);

    const content = result.message.content;

    if (result.reasoningContent) {
      console.log(`\n🧠 Reasoning:\n${result.reasoningContent}\n`);
    }

    // If no tool calls, we're done
    if (result.toolCalls.length === 0) {
      console.log(`\n🤖 Assistant: ${content}\n`);

      fireLoopEndHooks(ctx);

      messageHistory.push(new HumanMessage(userInput));
      messageHistory.push(new AIMessage(content));
      return { answer: content, history: messageHistory };
    }

    messages.push(result.message);

    const { toolCallInfos, toolMessages } = await processToolCalls(result.toolCalls, toolsRegistry);
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
