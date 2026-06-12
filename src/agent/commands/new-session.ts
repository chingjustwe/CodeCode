/**
 * `/new` command — creates a new chat session, clearing the current
 * conversation history. The previous session is automatically saved
 * by the REPL before this command runs.
 *
 * Exports:
 * - `NewSessionCommand` — class extending `Command`
 *
 * Dependencies:
 * - `sessionManager` — from `../../session/session-manager.js`
 * - `historyRef` — from `../history-ref.js`
 *
 * Registered in: `src/agent/commands/index.ts`
 */
import { Command } from "./command.js";
import { sessionManager } from "../../session/session-manager.js";
import { historyRef } from "../history-ref.js";

export class NewSessionCommand extends Command {
  readonly name = "new";
  readonly description = "Start a new chat session";
  readonly usage = "/new";

  execute(): string {
    const previousId = sessionManager.getCurrentId();
    const newId = sessionManager.createNew();
    historyRef.current = [];
    return `New session started: ${newId}${previousId ? ` (previous: ${previousId})` : ""}`;
  }
}
