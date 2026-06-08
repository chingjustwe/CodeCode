/**
 * Token usage tracker — implements LoopListener to accumulate per-round
 * token usage from the LLM API and print a formatted summary on loop end.
 *
 * Exports:
 * - `UsageTracker` — class; implements LoopListener via onAfterModelInvoke/onLoopEnd
 * - `usageTracker` — singleton instance
 *
 * Registered in: `src/index.ts` via `registerLoopListener(usageTracker)`
 */
import type { LoopListener, RoundContext } from "../hooks.js";
import type { TokenUsage } from "../../types/index.js";

function formatTokenInfo(usage: TokenUsage, contextWindow: number): string {
  const pct = ((usage.totalTokens / contextWindow) * 100).toFixed(1);
  const ctxLabel = contextWindow >= 1000 ? `${(contextWindow / 1000).toFixed(0)}K` : String(contextWindow);
  return `📊 Tokens: ${usage.inputTokens.toLocaleString()} in + ${usage.outputTokens.toLocaleString()} out = ${usage.totalTokens.toLocaleString()} total (${pct}% of ${ctxLabel})`;
}

export class UsageTracker implements LoopListener {
  totalUsage: TokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

  onAfterModelInvoke(usage: TokenUsage): void {
    this.totalUsage.inputTokens += usage.inputTokens;
    this.totalUsage.outputTokens += usage.outputTokens;
    this.totalUsage.totalTokens += usage.totalTokens;
  }

  onLoopEnd(ctx: RoundContext): void {
    if (this.totalUsage.totalTokens > 0) {
      console.log(`  ${formatTokenInfo(this.totalUsage, ctx.contextWindow)}\n`);
    }
  }

  getTotalUsage(): TokenUsage {
    return this.totalUsage;
  }

  reset(): void {
    this.totalUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  }
}

export const usageTracker = new UsageTracker();
