import { BaseTool } from "../tool.js";
import { defaultRegistry } from "../skill-registry.js";

export class LoadSkillTool extends BaseTool {
  readonly name = "load_skill";
  readonly description =
    "Load the full body of a named skill into the current context.";
  readonly inputSchema = {
    type: "object" as const,
    properties: {
      name: { type: "string" },
    },
    required: ["name"],
  };

  execute(args: Record<string, unknown>): string {
    console.log(`  🛠️  Tool called: load_skill(${JSON.stringify(args)})`);
    return defaultRegistry.loadFullText(args.name as string);
  }
}
