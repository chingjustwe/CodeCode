/**
 * `/prompt` command — prints the current system prompt to the console.
 * Useful for debugging or inspecting what instructions the agent is receiving.
 *
 * Exports:
 * - `PromptCommand` — class extending `Command`, registered in `src/agent/commands/index.ts`
 *
 * Dependencies:
 * - `src/agent/prompt.ts` — `buildSystemPrompt()` for generating the prompt string
 */
import { Command } from "./command.js";
import { buildSystemPrompt } from "../prompt.js";

export class PromptCommand extends Command {
  readonly name = "prompt";
  readonly description = "Show the current system prompt";

  execute(): string {
    const prompt = buildSystemPrompt();
    return `--- System Prompt ---\n${prompt}\n--- End ---`;
  }
}
