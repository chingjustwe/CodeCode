export interface RoundContext {
  roundIndex: number;
  maxRounds: number;
  messageCount: number;
}

export interface ToolCallInfo {
  name: string;
  success: boolean;
}

export interface LoopListener {
  onRoundStart?(ctx: RoundContext): string | null;
  onRoundEnd?(ctx: RoundContext, toolCalls: ToolCallInfo[]): void;
}

const listeners: LoopListener[] = [];

export function registerLoopListener(listener: LoopListener): void {
  listeners.push(listener);
}

export function getLoopListeners(): LoopListener[] {
  return listeners;
}
