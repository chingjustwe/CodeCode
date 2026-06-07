import { BaseTool } from "../tool.js";

export class CalculateTool extends BaseTool {
  readonly name = "calculate";
  readonly description = "Evaluate a mathematical expression (e.g. '2 + 3 * 4')";
  readonly inputSchema = {
    type: "object" as const,
    properties: {
      expression: {
        type: "string",
        description: "The mathematical expression to evaluate",
      },
    },
    required: ["expression"],
  };

  execute(args: Record<string, unknown>): string {
    const expression = args.expression as string;
    console.log(`  🛠️  Tool called: calculate(${JSON.stringify({ expression })})`);
    try {
      const sanitized = expression.replace(/[^0-9+\-*/.() ]/g, "");
      // eslint-disable-next-line no-eval
      const result = eval(sanitized);
      return `Result: ${result}`;
    } catch {
      return "Error: invalid expression";
    }
  }
}
