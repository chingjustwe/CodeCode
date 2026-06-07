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
import { Tool, AgentResult, ChatModel, TokenUsage } from "../types/index.js";
import { buildSystemPrompt } from "./prompt.js";
import { ToolRegistry } from "./tools/tool-registry.js";
import { getLoopListeners } from "./hooks.js";
import type { ToolCallInfo } from "./hooks.js";

const MAX_ITERATIONS = 20;
const MAX_TOKENS = 8096;

function formatTokenInfo(usage: TokenUsage, contextWindow: number): string {
  const pct = ((usage.totalTokens / contextWindow) * 100).toFixed(1);
  const ctxLabel = contextWindow >= 1000 ? `${(contextWindow / 1000).toFixed(0)}K` : String(contextWindow);
  return `📊 Tokens: ${usage.inputTokens.toLocaleString()} in + ${usage.outputTokens.toLocaleString()} out = ${usage.totalTokens.toLocaleString()} total (${pct}% of ${ctxLabel})`;
}

export async function agentLoop(
  userInput: string,
  model: ChatModel,
  toolsRegistry: ToolRegistry,
  messageHistory: BaseMessage[] = []
): Promise<AgentResult> {
  const systemPrompt = buildSystemPrompt();
  const toolDefs = toolsRegistry.definitions();
  const listeners = getLoopListeners();

  const messages: BaseMessage[] = [
    ...messageHistory,
    new HumanMessage(userInput),
  ];

  console.log(`\n🤔 User: ${userInput}`);

  let totalUsage: TokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const ctx = { roundIndex: i, maxRounds: MAX_ITERATIONS, messageCount: messages.length };

    for (const listener of listeners) {
      const injection = listener.onRoundStart?.(ctx);
      if (injection) {
        messages.push(new HumanMessage(injection));
      }
    }

    const result = await model.invoke({
      system: systemPrompt,
      messages,
      tools: toolDefs,
      maxTokens: MAX_TOKENS,
    });

    if (result.usage) {
      totalUsage.inputTokens += result.usage.inputTokens;
      totalUsage.outputTokens += result.usage.outputTokens;
      totalUsage.totalTokens += result.usage.totalTokens;
    }

    const content = result.message.content;

    if (result.toolCalls.length === 0) {
      console.log(
        `  🤖 Assistant: ${content.substring(0, 120)}${content.length > 120 ? "..." : ""}`
      );
      console.log(`\n✅ Final Answer: ${content}\n`);

      if (totalUsage.totalTokens > 0) {
        console.log(`  ${formatTokenInfo(totalUsage, model.contextWindow)}\n`);
      }

      messageHistory.push(new HumanMessage(userInput));
      messageHistory.push(new AIMessage(content));
      return { answer: content, history: messageHistory };
    }

    messages.push(result.message);

    const toolCallInfos: ToolCallInfo[] = [];

    for (const toolCall of result.toolCalls) {
      const tool = toolsRegistry.get(toolCall.name);

      if (!tool) {
        console.log(`  ⚠️  Unknown tool: "${toolCall.name}"`);
        toolCallInfos.push({ name: toolCall.name, success: false });
        messages.push(
          new HumanMessage(
            `Error: Tool "${toolCall.name}" not found. Available: ${toolsRegistry.list().join(", ")}.`
          )
        );
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

      console.log(`  👁️  Observation: ${observation.substring(0, 200)}${observation.length > 200 ? "..." : ""}`);

      messages.push(
        new HumanMessage(
          `Tool "${toolCall.name}" returned:\n${observation}`
        )
      );
    }

    for (const listener of listeners) {
      listener.onRoundEnd?.(ctx, toolCallInfos);
    }
  }

  console.log("⚠️  Max iterations reached. Ending loop.");
  if (totalUsage.totalTokens > 0) {
    console.log(`  ${formatTokenInfo(totalUsage, model.contextWindow)}\n`);
  }
  return {
    answer: "Sorry, I couldn't complete the task in time.",
    history: messageHistory,
  };
}
