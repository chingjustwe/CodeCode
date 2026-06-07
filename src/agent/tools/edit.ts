import { readFileSync, writeFileSync } from "fs";
import { BaseTool } from "../tool.js";
import { safePath } from "../../utils/file-utils.js";

export class EditTool extends BaseTool {
  readonly name = "edit";
  readonly description =
    "Edit a file by replacing the first occurrence of old_text with new_text. Path traversal outside the workspace is rejected.";
  readonly inputSchema = {
    type: "object" as const,
    properties: {
      path: {
        type: "string",
        description:
          "Relative or absolute path to the file (must stay within workspace)",
      },
      old_text: {
        type: "string",
        description: "The exact text to find and replace",
      },
      new_text: {
        type: "string",
        description: "The replacement text",
      },
    },
    required: ["path", "old_text", "new_text"],
  };

  execute(args: Record<string, unknown>): string {
    const path = args.path as string;
    const oldText = args.old_text as string;
    const newText = args.new_text as string;
    console.log(
      `  🛠️  Tool called: edit(${JSON.stringify({ path, old_length: oldText.length, new_length: newText.length })})`
    );
    try {
      const resolved = safePath(path);
      const content = readFileSync(resolved, "utf-8");
      if (!content.includes(oldText)) {
        return `Error: Text not found in ${path}`;
      }
      const updated = content.replace(oldText, newText);
      writeFileSync(resolved, updated, "utf-8");
      return `Edited ${path}`;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return `Error: ${message}`;
    }
  }
}
