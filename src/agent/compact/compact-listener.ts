/**
 * LoopListener that applies context compression on each round:
 * - `onBeforeToolResult` → Layer 1: persist large tool outputs to disk
 * - `onRoundStart` → Layer 2: compact old tool-result messages
 *
 * Exports:
 * - `CompactListener` — class implementing `LoopListener`
 * - `compactListener` — singleton instance
 *
 * Registered in: `src/index.ts` via `registerLoopListener(compactListener)`
 * Dependencies: `./index.ts` — `persistLargeOutput`, `compactToolResults`
 */
import type { LoopListener, RoundContext } from "../hooks.js";
import { persistLargeOutput, compactToolResults } from "./index.js";

export class CompactListener implements LoopListener {
  onRoundStart(ctx: RoundContext): string | null {
    compactToolResults(ctx.messages, 3); // TODO: make "3" configurable?
    return null;
  }

  onBeforeToolResult(_toolCallId: string, _toolName: string, observation: string): string {
    return persistLargeOutput(_toolCallId, observation);
  }
}

export const compactListener = new CompactListener();
