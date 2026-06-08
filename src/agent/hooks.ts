/**
 * Hooks / listener system for the agent loop. Allows external modules
 * (e.g. TodoManager, CompactListener) to observe and inject into each
 * round of the agent's reasoning loop.
 *
 * Exports:
 * - `RoundContext` — context passed to listeners on each round
 * - `ToolCallInfo` — info about a single tool invocation (name + success)
 * - `LoopListener` — interface; implement to observe round start/end/tool results
 * - `registerLoopListener(l)` — register a listener singleton
 * - `getLoopListeners()` — retrieve all registered listeners
 */
import { BaseMessage, HumanMessage } from "../types/messages.js";

export interface RoundContext {
  roundIndex: number;
  maxRounds: number;
  messageCount: number;
  messages: BaseMessage[];
}

export interface ToolCallInfo {
  name: string;
  success: boolean;
}

export interface LoopListener {
  onRoundStart?(ctx: RoundContext): string | null;
  onBeforeToolResult?(toolCallId: string, toolName: string, observation: string): string;
  onRoundEnd?(ctx: RoundContext, toolCalls: ToolCallInfo[]): void;
}

const listeners: LoopListener[] = [];

export function registerLoopListener(listener: LoopListener): void {
  listeners.push(listener);
}

export function getLoopListeners(): LoopListener[] {
  return listeners;
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

/** Run all onRoundEnd hooks. */
export function fireRoundEndHooks(ctx: RoundContext, toolCalls: ToolCallInfo[]): void {
  for (const listener of listeners) {
    listener.onRoundEnd?.(ctx, toolCalls);
  }
}
