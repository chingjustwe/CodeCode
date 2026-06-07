import { BaseTool } from "../../tool.js";
import { todoManager, type RawPlanItem } from "./todo.js";

export class TodoTool extends BaseTool {
  readonly name = "todo";
  readonly description =
    "Update the current session plan for multi-step work. Use this to create, update, or rewrite the todo list. Only one item can be in_progress at a time.";
  readonly inputSchema = {
    type: "object" as const,
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            content: {
              type: "string",
              description: "Short description of the task step",
            },
            status: {
              type: "string",
              enum: ["pending", "in_progress", "completed"],
              description:
                "pending = not started, in_progress = currently working, completed = done",
            },
            activeForm: {
              type: "string",
              description:
                "Optional present-continuous label shown while the step is in progress",
            },
          },
          required: ["content", "status"],
        },
      },
    },
    required: ["items"],
  };

  execute(args: Record<string, unknown>): string {
    const items = args.items as RawPlanItem[];
    console.log(
      `  🛠️  Tool called: todo(${JSON.stringify({ count: items.length })})`
    );
    try {
      const rendered = todoManager.update(items);
      console.log(`\n📋 Plan:\n${rendered}\n`);
      return JSON.stringify({
        items: todoManager.items,
        rounds_since_update: todoManager.roundsSinceUpdate,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return `Error: ${message}`;
    }
  }
}