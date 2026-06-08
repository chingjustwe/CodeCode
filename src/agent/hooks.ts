/**
 * Hooks / listener system for the agent loop. Allows external modules
 * (e.g. TodoManager, CompactListener, UsageTracker) to observe and inject
 * into each round of the agent's reasoning loop.
 *
 * Exports:
 * - `RoundContext` — context passed to listeners on each round
 * - `ToolCallInfo` — info about a single tool invocation (name + success)
 * - `LoopListener` — interface; implement to observe round start/end/tool results
 * - `registerLoopListener(l)` — register a listener singleton
 * - `getLoopListeners()` — retrieve all registered listeners
 * - `fireAfterModelInvokeHooks(usage)` — dispatch usage data to listeners
 */
import { BaseMessage, HumanMessage } from "../types/messages.js";
import type { TokenUsage } from "../types/index.js";

export interface RoundContext {
  roundIndex: number;
  maxRounds: number;
  messageCount: number;
  messages: BaseMessage[];
  contextWindow: number;
}

export interface ToolCallInfo {
  name: string;
  success: boolean;
}

export interface BeforeToolCallResult {
  allowed: boolean;
  reason: string;
}

export interface LoopListener {
  onRoundStart?(ctx: RoundContext): string | null;
  onAfterModelInvoke?(usage: TokenUsage): void;
  onBeforeToolResult?(toolCallId: string, toolName: string, observation: string): string;
  onBeforeToolCall?(toolName: string, args: Record<string, unknown>): BeforeToolCallResult | null | Promise<BeforeToolCallResult | null>;
  onRoundEnd?(ctx: RoundContext, toolCalls: ToolCallInfo[]): void;
  onLoopEnd?(ctx: RoundContext): void;
}

const listeners: LoopListener[] = [];

export function registerLoopListener(listener: LoopListener): void {
  listeners.push(listener);
}

export function getLoopListeners(): LoopListener[] {
  return listeners;
}

/** Run all onAfterModelInvoke hooks with per-round usage data. */
export function fireAfterModelInvokeHooks(usage: TokenUsage | undefined): void {
  if (!usage) return;
  for (const listener of listeners) {
    listener.onAfterModelInvoke?.(usage);
  }
}

/** Run all onRoundStart hooks and return any injections as HumanMessages. */
export function fireRoundStartHooks(ctx: RoundContext, messages: BaseMessage[]): HumanMessage[] {
  const injections: HumanMessage[] = [];
  for (const listener of listeners) {
    const text = listener.onRoundStart?.(ctx);
    if (text) {
      const msg = new HumanMessage(text);
      injections.push(msg);
      messages.push(msg);
    }
  }
  return injections;
}

/** Run all onBeforeToolResult hooks to transform a tool observation. */
export function applyBeforeToolResultHooks(
  toolCallId: string,
  toolName: string,
  observation: string,
): string {
  let result = observation;
  for (const listener of listeners) {
    if (listener.onBeforeToolResult) {
      result = listener.onBeforeToolResult(toolCallId, toolName, result);
    }
  }
  return result;
}

/** Run all onBeforeToolCall hooks. Returns the first veto, or a default allow. */
export async function fireBeforeToolCallHooks(
  toolName: string,
  args: Record<string, unknown>,
): Promise<BeforeToolCallResult> {
  for (const listener of listeners) {
    const result = await listener.onBeforeToolCall?.(toolName, args);
    if (result && !result.allowed) {
      return result;
    }
  }
  return { allowed: true, reason: "" };
}

/** Run all onRoundEnd hooks. */
export function fireRoundEndHooks(ctx: RoundContext, toolCalls: ToolCallInfo[]): void {
  for (const listener of listeners) {
    listener.onRoundEnd?.(ctx, toolCalls);
  }
}

/** Run all onLoopEnd hooks (loop terminating normally or via limit). */
export function fireLoopEndHooks(ctx: RoundContext): void {
  for (const listener of listeners) {
    listener.onLoopEnd?.(ctx);
  }
}
