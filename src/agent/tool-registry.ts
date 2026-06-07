import type { Tool, ToolDefinition } from "../types/index.js";
import { BaseTool } from "./tool.js";

export class ToolRegistry {
  private _tools = new Map<string, Tool>();

  register(tool: Tool): void {
    this._tools.set(tool.definition.name, tool);
  }

  registerFrom(baseTool: BaseTool): void {
    this.register(baseTool);
  }

  unregister(name: string): boolean {
    return this._tools.delete(name);
  }

  get(name: string): Tool | undefined {
    return this._tools.get(name);
  }

  has(name: string): boolean {
    return this._tools.has(name);
  }

  list(): string[] {
    return [...this._tools.keys()];
  }

  definitions(): ToolDefinition[] {
    return [...this._tools.values()].map((t) => t.definition);
  }

  toRecord(): Record<string, Tool> {
    return Object.fromEntries(this._tools);
  }
}

export const toolRegistry = new ToolRegistry();
