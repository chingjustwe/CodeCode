import { mkdirSync, writeFileSync } from "fs";
import { resolve } from "path";
import { BaseTool } from "../tool.js";
import { safePath } from "../../utils/file-utils.js";

export class WriteTool extends BaseTool {
  readonly name = "write";
  readonly description =
    "Write content to a file in the current workspace. Parent directories are created automatically. Path traversal outside the workspace is rejected.";
  readonly inputSchema = {
    type: "object" as const,
    properties: {
      path: {
        type: "string",
        description:
          "Relative or absolute path to the file (must stay within workspace)",
      },
      content: {
        type: "string",
        description: "The content to write to the file",
      },
    },
    required: ["path", "content"],
  };

  execute(args: Record<string, unknown>): string {
    const path = args.path as string;
    const content = args.content as string;
    console.log(
      `  🛠️  Tool called: write(${JSON.stringify({ path, contentLength: content.length })})`
    );
    try {
      const resolved = safePath(path);
      const dir = resolve(resolved, "..");
      mkdirSync(dir, { recursive: true });
      writeFileSync(resolved, content, "utf-8");
      return `Wrote ${content.length} bytes to ${path}`;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return `Error: ${message}`;
    }
  }
}
