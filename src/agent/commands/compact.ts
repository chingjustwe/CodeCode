/**
 * `/compact` command — compresses conversation context to save tokens.
 * Delegates to `src/agent/compact/index.ts` for transcript saving and
 * LLM-based summarization.
 *
 * Exports:
 * - `CompactCommand` — class extending `Command`
 *
 * Dependencies:
 * - `currentModel` (from `src/llm/factory.ts`) — global ChatModel singleton
 * - `historyRef` (from `../history-ref.js`) — mutable conversation history ref
 *
 * Registered in: `src/agent/commands/index.ts`
 */
import { Command } from "./command.js";
import { currentModel } from "../../llm/factory.js";
import { historyRef } from "../history-ref.js";
import { HumanMessage } from "../../types/messages.js";
import {
  saveTranscript,
  generateContinuitySummary,
} from "../compact/index.js";

export class CompactCommand extends Command {
  readonly name = "compact";
  readonly description = "Compress conversation context to save tokens";
  readonly aliases = ["c"];
  readonly usage = "/compact [focus]";

  async execute(args: string[]): Promise<string> {
    try {
      if (!currentModel) {
        return "Error: No LLM model available. Cannot compact without a model.";
      }

      if (historyRef.current.length === 0) {
        return "No conversation history to compact.";
      }

      const focus = args.join(" ");

      const transcriptPath = saveTranscript(historyRef.current);

      const summary = await generateContinuitySummary(
        historyRef.current,
        currentModel,
        focus,
      );

      historyRef.current = [
        new HumanMessage(
          `This conversation was compacted so the agent can continue working.\n\n${summary}`,
        ),
      ];

      return `✅ Compressed into a summary.\n📝 Transcript saved: ${transcriptPath}`;
    } catch (err) {
      return `Error during compaction: ${err instanceof Error ? err.message : String(err)}`;
    }
  }
}
