/**
 * Mutable reference to the current conversation history array.
 * Allows slash commands (e.g. `/compact`) to replace the REPL's history.
 *
 * Exports:
 * - `historyRef` — `{ current: BaseMessage[] }`, updated by REPL after each loop
 *
 * Used by: `src/cli/repl.ts` (maintains the value),
 *          `src/agent/commands/compact.ts` (reads/replaces on compact)
 */
import { BaseMessage } from "../types/messages.js";

export const historyRef: { current: BaseMessage[] } = {
  current: [],
};
