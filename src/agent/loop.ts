import { HumanMessage, AIMessage, BaseMessage } from "../types/messages.js";
import { Tool, AgentResult, ChatModel } from "../types/index.js";
import { buildSystemPrompt } from "./prompt.js";
import { getToolDefinitions } from "./tools.js";
import { getLoopListeners } from "./hooks.js";
import type { ToolCallInfo } from "./hooks.js";

const MAX_ITERATIONS = 20;
const MAX_TOKENS = 8096;

export async function agentLoop(
  userInput: string,
  model: ChatModel,
  toolsRegistry: Record<string, Tool>,
  messageHistory: BaseMessage[] = []
): Promise<AgentResult> {
  const systemPrompt = buildSystemPrompt();
  const toolDefs = getToolDefinitions();
  const listeners = getLoopListeners();

  const messages: BaseMessage[] = [
    ...messageHistory,
    new HumanMessage(userInput),
  ];

  console.log(`\n🤔 User: ${userInput}`);

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

    const content = result.message.content;

    if (result.toolCalls.length === 0) {
      console.log(
        `  🤖 Assistant: ${content.substring(0, 120)}${content.length > 120 ? "..." : ""}`
      );
      console.log(`\n✅ Final Answer: ${content}\n`);

      messageHistory.push(new HumanMessage(userInput));
      messageHistory.push(new AIMessage(content));
      return { answer: content, history: messageHistory };
    }

    const assistantMsg = result.message;
    if (!assistantMsg.content) {
      assistantMsg.content = " ";
    }
    messages.push(assistantMsg);

    const toolCallInfos: ToolCallInfo[] = [];

    for (const toolCall of result.toolCalls) {
      const tool = toolsRegistry[toolCall.name];

      if (!tool) {
        console.log(`  ⚠️  Unknown tool: "${toolCall.name}"`);
        toolCallInfos.push({ name: toolCall.name, success: false });
        messages.push(
          new HumanMessage(
            `Error: Tool "${toolCall.name}" not found. Available: ${Object.keys(toolsRegistry).join(", ")}.`
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
  return {
    answer: "Sorry, I couldn't complete the task in time.",
    history: messageHistory,
  };
}
