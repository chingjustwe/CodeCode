import type { LoopListener, RoundContext, ToolCallInfo } from "../../hooks.js";

export type TodoStatus = "pending" | "in_progress" | "completed";

export interface PlanItem {
  content: string;
  status: TodoStatus;
  activeForm: string;
}

export interface RawPlanItem {
  content: string;
  status?: TodoStatus;
  activeForm?: string;
}

export class TodoManager implements LoopListener {
  items: PlanItem[] = [];
  roundsSinceUpdate = 0;

  update(rawItems: RawPlanItem[]): string {
    const validated: PlanItem[] = [];
    let inProgressCount = 0;

    for (const item of rawItems) {
      const status = item.status ?? "pending";
      if (status === "in_progress") {
        inProgressCount += 1;
      }
      validated.push({
        content: item.content,
        status,
        activeForm: item.activeForm ?? "",
      });
    }

    if (inProgressCount > 1) {
      throw new Error("Only one item can be in_progress at a time");
    }

    this.items = validated;
    this.roundsSinceUpdate = 0;
    return this.render();
  }

  onRoundStart(_ctx: RoundContext): string | null {
    if (this.items.length > 0 && this.roundsSinceUpdate >= 3) {
      return "<reminder>Refresh your current plan before continuing.</reminder>";
    }
    return null;
  }

  onRoundEnd(_ctx: RoundContext, toolCalls: ToolCallInfo[]): void {
    const todoCall = toolCalls.find((tc) => tc.name === "todo");
    if (!todoCall) {
      this.roundsSinceUpdate += 1;
    }
  }

  render(): string {
    const lines: string[] = [];
    for (const item of this.items) {
      const marker: Record<TodoStatus, string> = {
        pending: "[ ]",
        in_progress: "[>]",
        completed: "[x]",
      };
      lines.push(`${marker[item.status]} ${item.content}`);
    }
    return lines.join("\n");
  }
}

export const todoManager = new TodoManager();