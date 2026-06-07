/**
 * `/compact` command — compresses conversation context to save tokens.
 * Saves a JSONL transcript of the current conversation, then uses the LLM
 * to produce a compact summary that replaces the message history.
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
import * as fs from "node:fs";
import * as path from "node:path";
import { Command } from "./command.js";
import { currentModel } from "../../llm/factory.js";
import { historyRef } from "../history-ref.js";
import { BaseMessage, HumanMessage } from "../../types/messages.js";
import type { ChatModel } from "../../types/index.js";

const TRANSCRIPT_DIR = path.resolve(".agents/transcripts");

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

      const transcriptPath = await this.saveTranscript(historyRef.current);

      const summary = await this.summarize(historyRef.current, currentModel, focus);

      historyRef.current = [
        new HumanMessage(
          `This conversation was compacted so the agent can continue working.\n\n${summary}`
        ),
      ];

      return `✅ Compressed ${historyRef.current.length} messages into a summary.\n📝 Transcript saved: ${transcriptPath}`;
    } catch (err) {
      return `Error during compaction: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  private async saveTranscript(messages: BaseMessage[]): Promise<string> {
    fs.mkdirSync(TRANSCRIPT_DIR, { recursive: true });
    const timestamp = Math.floor(Date.now() / 1000);
    const filePath = path.join(TRANSCRIPT_DIR, `transcript_${timestamp}.jsonl`);

    const lines = messages.map((msg) =>
      JSON.stringify({ role: msg.role, content: msg.content })
    );

    fs.writeFileSync(filePath, lines.join("\n") + "\n", "utf-8");
    return filePath;
  }

  private async summarize(
    messages: BaseMessage[],
    model: ChatModel,
    focus: string
  ): Promise<string> {
    const conversation = messages
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n")
      .slice(0, 80000);

    const prompt =
      "Summarize this coding-agent conversation so work can continue.\n" +
      "Preserve:\n" +
      "1. The current goal\n" +
      "2. Important findings and decisions\n" +
      "3. Files read or changed\n" +
      "4. Remaining work\n" +
      "5. User constraints and preferences\n" +
      "Be compact but concrete.\n\n" +
      conversation;

    const result = await model.invoke({
      messages: [new HumanMessage(prompt)],
      maxTokens: 2000,
    });

    let summary = result.message.content;

    if (focus) {
      summary += `\n\nFocus to preserve next: ${focus}`;
    }

    return summary;
  }
}
