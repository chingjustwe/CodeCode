/**
 * Context compression for the agent loop — three layers:
 *
 * 1. `persistLargeOutput()` — writes large tool outputs to disk, returns a
 *    `<persisted-output>` wrapper with a preview instead of the full text.
 * 2. `compactToolResults()` — replaces all but the most recent N tool-result
 *    messages with a short placeholder to keep context lean.
 * 3. `generateContinuitySummary()` — LLM-produced summary that replaces the
 *    entire history (used by the `/compact` command and auto-compaction).
 *
 * Exports:
 * - `PERSIST_THRESHOLD` — character count above which output is persisted
 * - `persistLargeOutput(id, output)` — Layer 1
 * - `collectToolResultMessages(messages)` — find tool-result messages
 * - `compactToolResults(messages, keep?)` — Layer 2
 * - `saveTranscript(messages, dir?)` — save conversation to JSONL file
 * - `generateContinuitySummary(messages, model, focus?)` — Layer 3
 *
 * Used by:
 * - `./compact-listener.js` — `CompactListener` class (registered in `src/index.ts`)
 * - `src/agent/commands/compact.ts` — Layer 3 invoked on demand
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { BaseMessage, HumanMessage } from "../../types/messages.js";
import type { ChatModel } from "../../types/index.js";
import { CODEDIR } from "../../utils/constants.js";
// ─── Layer 1 — persist large tool outputs ─────────────────────────────────

/** Outputs longer than this (characters) are saved to disk instead of inlined. */
export const PERSIST_THRESHOLD = 4000; // TODO: determine a good threshold value through testing and iteration

/** Directory under CODEDIR where persisted outputs are stored. */
const OUTPUT_DIR = path.join(CODEDIR, "tool-results");

/** How many characters of the preview to include in the wrapper. */
const PREVIEW_LENGTH = 2000; // TODO: determine a good preview length through testing and iteration

function saveOutputToDisk(id: string, output: string): string {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const filePath = path.join(OUTPUT_DIR, `${id}.txt`);
  fs.writeFileSync(filePath, output, "utf-8");
  return filePath;
}

/**
 * Layer 1: if `output` exceeds PERSIST_THRESHOLD, write it to
 * `.task_outputs/tool-results/<id>.txt` and return a preview wrapper.
 * Otherwise returns the output unchanged.
 */
export function persistLargeOutput(id: string, output: string): string {
  if (output.length <= PERSIST_THRESHOLD) {
    return output;
  }

  const storedPath = saveOutputToDisk(id, output);
  const preview = output.slice(0, PREVIEW_LENGTH);

  return [
    "",
    "<persisted-output>",
    `Full output saved to: ${storedPath}`,
    "Preview:",
    preview,
    "</persisted-output>",
    "",
  ].join("\n");
}

// ─── Layer 2 — compact old tool results ───────────────────────────────────

/** Prefix used in loop.ts when pushing tool results as HumanMessages. */
const TOOL_RESULT_PREFIX = 'Tool "';

/**
 * Find every message in the array that is a tool-result message
 * (role: "user", content starts with `Tool "`).
 *
 * Returns objects with the index in the original array and the message.
 */
export function collectToolResultMessages(
  messages: BaseMessage[],
): Array<{ index: number; message: BaseMessage }> {
  const results: Array<{ index: number; message: BaseMessage }> = [];
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role === "user" && msg.content.startsWith(TOOL_RESULT_PREFIX)) {
      results.push({ index: i, message: msg });
    }
  }
  return results;
}

/**
 * Layer 2: keep the last `keep` (default 3) tool-result messages with their
 * full content; replace all earlier tool-result messages with a short
 * placeholder to conserve context.
 *
 * Mutates messages in place and returns the same array for convenience.
 */
export function compactToolResults(
  messages: BaseMessage[],
  keep: number = 3,
): BaseMessage[] {
  const results = collectToolResultMessages(messages);
  if (results.length <= keep) return messages;

  const toReplace = results.slice(0, results.length - keep);
  for (const { message } of toReplace) {
    message.content = "[Earlier tool result omitted for brevity]";
  }
  return messages;
}

// ─── Layer 3 — continuity summary (shared with /compact) ──────────────────

const DEFAULT_TRANSCRIPT_DIR = path.join(CODEDIR, "transcripts");

/**
 * Save the current conversation to a JSONL transcript file.
 * Returns the path to the saved file.
 */
export function saveTranscript(
  messages: BaseMessage[],
  dir: string = DEFAULT_TRANSCRIPT_DIR,
): string {
  fs.mkdirSync(dir, { recursive: true });
  const timestamp = Math.floor(Date.now() / 1000);
  const filePath = path.join(dir, `transcript_${timestamp}.jsonl`);

  const lines = messages.map((msg) =>
    JSON.stringify({ role: msg.role, content: msg.content }),
  );

  fs.writeFileSync(filePath, lines.join("\n") + "\n", "utf-8");
  return filePath;
}

/**
 * Layer 3: use the LLM to produce a compact continuity summary of the
 * conversation. Designed to replace the full message history so the agent
 * can continue working without losing context.
 *
 * `focus` is an optional string that gets appended to the summary,
 * instructing the agent what to prioritise next.
 */
export async function generateContinuitySummary(
  messages: BaseMessage[],
  model: ChatModel,
  focus?: string,
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
