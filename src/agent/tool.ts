import type { Tool, ToolDefinition, ToolParameterProperty } from "../types/index.js";

export abstract class BaseTool implements Tool {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly inputSchema: {
    type: "object";
    properties: Record<string, ToolParameterProperty>;
    required?: string[];
  };

  abstract execute(args: Record<string, unknown>): string | Promise<string>;

  get definition(): ToolDefinition {
    return {
      name: this.name,
      description: this.description,
      input_schema: this.inputSchema,
    };
  }

  get fn(): (args: unknown) => string | Promise<string> {
    return (args: unknown) => this.execute(args as Record<string, unknown>);
  }
}
