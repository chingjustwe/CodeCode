import * as readline from "node:readline/promises";
import "dotenv/config";
import { stdin as input, stdout as output } from "node:process";
import { BaseMessage } from "../types/messages.js";
import { ChatModel, Tool } from "../types/index.js";
import { agentLoop } from "../agent/loop.js";
import { printAvailableProviders } from "../llm/factory.js";

const rl = readline.createInterface({ input, output });

/**
 * Start an interactive REPL session with the agent.
 * The user types messages and gets responses until they type "exit".
 */
export async function startRepl(
  model: ChatModel,
  tools: Record<string, Tool>
): Promise<void> {
  console.log("╔════════════════════════════════════════════════════╗");
  console.log("║       LangChain.js Hello World Agent (TS)         ║");
  console.log("║                                                   ║");
  console.log(`║  Model : ${process.env.LLM_PROVIDER ?? "openai"}/${model.modelName.padEnd(25)}║`);
  printAvailableProviders();
  console.log("║  Type 'exit' or Ctrl+C to quit                   ║");
  console.log("╚════════════════════════════════════════════════════╝");

  let history: BaseMessage[] = [];

  while (true) {
    const userInput = await rl.question("\nYou: ");
    if (userInput.toLowerCase() === "exit") break;

    const result = await agentLoop(userInput, model, tools, history);
    history = result.history;
  }

  rl.close();
  console.log("\n👋 Goodbye!");
}