import { readFileSync } from "fs";
import { BaseTool } from "../tool.js";
import { safePath } from "../../utils/file-utils.js";

export class ReadTool extends BaseTool {
  readonly name = "read";
  readonly description =
    "Read the contents of a file in the current workspace. Paths that escape the workspace are rejected.";
  readonly inputSchema = {
    type: "object" as const,
    properties: {
      path: {
        type: "string",
        description:
          "Relative or absolute path to the file (must stay within workspace)",
      },
      limit: {
        type: "number",
        description: "Maximum number of lines to read (optional)",
      },
    },
    required: ["path"],
  };

  execute(args: Record<string, unknown>): string {
    console.log(`  🛠️  Tool called: read(${JSON.stringify(args)})`);
    try {
      const resolved = safePath(args.path as string);
      const text = readFileSync(resolved, "utf-8");
      const lines = text.split("\n");
      if (args.limit !== undefined && (args.limit as number) < lines.length) {
        return lines.slice(0, args.limit as number).join("\n").slice(0, 50_000);
      }
      return text.slice(0, 50_000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return `Error: ${message}`;
    }
  }
}
