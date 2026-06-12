/**
 * Interactive REPL — reads user input from stdin, dispatches slash commands
 * via the command registry, and runs the agent loop for free-form queries.
 *
 * Exports:
 * - `startRepl(model, tools)` — main REPL loop, called from `src/index.ts`
 *
 * Dependencies:
 * - `src/agent/loop.ts` — the agent reasoning loop
 * - `src/agent/commands/command-registry.ts` — slash command dispatch
 * - `src/agent/tools/tool-registry.ts` — available tools
 * - `src/llm/factory.ts` — `printAvailableProviders()` for startup banner
 * - `src/session/session-manager.ts` — session persistence
 */
import * as readline from "node:readline/promises";
import "dotenv/config";
import { stdin as input, stdout as output } from "node:process";
import { ChatModel } from "../types/index.js";
import { agentLoop } from "../agent/loop.js";
import { ToolRegistry } from "../agent/tools/tool-registry.js";
import { commandRegistry } from "../agent/commands/command-registry.js";
import { printAvailableProviders } from "../llm/factory.js";
import { historyRef } from "../agent/history-ref.js";
import { sessionManager } from "../session/session-manager.js";

const rl = readline.createInterface({ input, output });

function parseCommand(input: string): { name: string; args: string[] } | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) return null;
  const parts = trimmed.slice(1).trim().split(/\s+/);
  return { name: parts[0], args: parts.slice(1) };
}

async function handleCommand(userInput: string): Promise<boolean> {
  const parsed = parseCommand(userInput);
  if (!parsed) return false;

  const cmd = commandRegistry.get(parsed.name);
  if (!cmd) {
    console.log(`Unknown command: /${parsed.name}. Type /help for available commands.`);
    return true;
  }

  const result = await Promise.resolve(cmd.execute(parsed.args));
  console.log(`\n${result}`);
  return true;
}

/**
 * Start an interactive REPL session with the agent.
 * The user types messages and gets responses until they type "exit".
 */
export async function startRepl(
  model: ChatModel,
  tools: ToolRegistry
): Promise<void> {
  console.log("╔════════════════════════════════════════════════════╗");
  console.log("║           CodeCode Agent (TypeScript)             ║");
  console.log("║                                                   ║");
  console.log(`║  Model : ${process.env.LLM_PROVIDER ?? "openai"}/${model.modelName.padEnd(25)}║`);
  printAvailableProviders();
  console.log("║  Type 'exit' or Ctrl+C to quit                   ║");
  console.log("╚════════════════════════════════════════════════════╝");

  historyRef.current = [];
  const sessionId = sessionManager.createNew();
  console.log(`  📝 Session: ${sessionId}`);

  while (true) {
    const userInput = await rl.question("\nYou: ");
    if (userInput.toLowerCase() === "exit") {
      sessionManager.saveCurrent(historyRef.current);
      break;
    }

    if (await handleCommand(userInput)) {
      sessionManager.saveCurrent(historyRef.current);
      continue;
    }

    const result = await agentLoop(userInput, model, tools, historyRef.current);
    historyRef.current = result.history;
    sessionManager.saveCurrent(historyRef.current);
  }

  rl.close();
  console.log("\n👋 Goodbye!");
}
