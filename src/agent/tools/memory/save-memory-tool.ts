/**
 * `save_memory` tool — persists a memory across sessions.
 * Stores user preferences, feedback, project facts, or external references
 * as individual Markdown files with YAML frontmatter under `{CODEDIR}/memory/`.
 *
 * Exports:
 * - `SaveMemoryTool` — tool class extending `BaseTool`, registered in
 *   `src/agent/tools/index.ts`
 *
 * Dependencies:
 * - `../../memory/memory-manager.js` — `memoryManager` singleton
 */
import { BaseTool } from "../tool.js";
import { memoryManager } from "./memory-manager.js";
import { MEMORY_TYPES } from "./memory-manager.js";

export class SaveMemoryTool extends BaseTool {
  readonly name = "save_memory";
  readonly description =
    "Save a persistent memory that will be available in future sessions. " +
    "Use this for user preferences, corrections, non-obvious project facts, " +
    "or external resource URLs. Do NOT save things easily derivable from code, " +
    "temporary task state, or secrets.";

  readonly inputSchema = {
    type: "object" as const,
    properties: {
      name: {
        type: "string",
        description: "Short unique identifier for this memory (e.g. 'tab_preference')",
      },
      description: {
        type: "string",
        description: "One-line summary of what this memory records",
      },
      type: {
        type: "string",
        enum: [...MEMORY_TYPES],
        description: "user = preference, feedback = correction, project = project fact, reference = external URL",
      },
      content: {
        type: "string",
        description: "Full text of the memory to persist",
      },
    },
    required: ["name", "description", "type", "content"],
  };

  execute(args: Record<string, unknown>): string {
    const name = args.name as string;
    const description = args.description as string;
    const memType = args.type as string;
    const content = args.content as string;

    console.log(`  🧠 Memory saved: ${name} [${memType}]`);
    return memoryManager.saveMemory(name, description, memType, content);
  }
}
