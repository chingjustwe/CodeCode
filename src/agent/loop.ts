import { HumanMessage, AIMessage, BaseMessage } from "../types/messages.js";
import { Tool, AgentResult, ChatModel } from "../types/index.js";
import { buildSystemPrompt } from "./prompt.js";
import { getToolDefinitions } from "./tools.js";

const MAX_ITERATIONS = 20;
const MAX_TOKENS = 8096;

/**
 * Run one turn of the agent loop using native tool calling:
 *
 * 1. Call model.invoke() with system prompt, message history, tools
 * 2. If the response contains tool_calls, execute each tool
 * 3. Append tool results as assistant + user messages
 * 4. Loop until the model responds with a final text answer (no tool calls)
 *
 * This mirrors the Claude Code interaction pattern:
 *   client.messages.create({ model, system, messages, tools, max_tokens })
 *
 * @returns The final answer and updated message history.
 */
export async function agentLoop(
  userInput: string,
  model: ChatModel,
  toolsRegistry: Record<string, Tool>,
  messageHistory: BaseMessage[] = []
): Promise<AgentResult> {
  const systemPrompt = buildSystemPrompt();
  const toolDefs = getToolDefinitions();

  // Build messages: history + new user input
  const messages: BaseMessage[] = [
    ...messageHistory,
    new HumanMessage(userInput),
  ];

  console.log(`\n🤔 User: ${userInput}`);

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    // ── Call the LLM with full params ────────────────────────────────
    const result = await model.invoke({
      system: systemPrompt,
      messages,
      tools: toolDefs,
      maxTokens: MAX_TOKENS,
    });

    const content = result.message.content;

    // If there are no tool calls, this is the final answer
    if (result.toolCalls.length === 0) {
      console.log(
        `  🤖 Assistant: ${content.substring(0, 120)}${content.length > 120 ? "..." : ""}`
      );
      console.log(`\n✅ Final Answer: ${content}\n`);

      // Add this exchange to history
      messageHistory.push(new HumanMessage(userInput));
      messageHistory.push(new AIMessage(content));
      return { answer: content, history: messageHistory };
    }

    // ── Handle native tool calls ─────────────────────────────────────
    // Push the assistant's response (with tool calls) into context
    messages.push(result.message);

    for (const toolCall of result.toolCalls) {
      const tool = toolsRegistry[toolCall.name];

      if (!tool) {
        console.log(`  ⚠️  Unknown tool: "${toolCall.name}"`);
        // Tell the model the tool doesn't exist
        messages.push(
          new HumanMessage(
            `Error: Tool "${toolCall.name}" not found. Available: ${Object.keys(toolsRegistry).join(", ")}.`
          )
        );
        continue;
      }

      // ── Execute the tool ─────────────────────────────────────────
      const observation = await Promise.resolve(tool.fn(toolCall.arguments));
      console.log(`  👁️  Observation: ${observation.substring(0, 200)}${observation.length > 200 ? "..." : ""}`);

      // Push the tool result back to the model as a user message
      // (OpenAI convention: tool results are prepended with "tool: tool_name")
      messages.push(
        new HumanMessage(
          `Tool "${toolCall.name}" returned:\n${observation}`
        )
      );
    }
  }

  console.log("⚠️  Max iterations reached. Ending loop.");
  return {
    answer: "Sorry, I couldn't complete the task in time.",
    history: messageHistory,
  };
}