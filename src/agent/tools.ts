import { Tool } from "../types/index.js";
import { resolve } from "path";
import { cwd } from "process";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { defaultRegistry } from "./skill-registry.js";
import { todoManager, type RawPlanItem } from "./todo.js";

// ─── Built-in Tools ────────────────────────────────────────────────────────

const WORKDIR = cwd();

/**
 * Resolve a path within the workspace, rejecting any that escape.
 */
function safePath(p: string): string {
  const path = resolve(WORKDIR, p);
  if (!path.startsWith(WORKDIR)) {
    throw new Error(`Path escapes workspace: ${p}`);
  }
  return path;
}

/**
 * Evaluate a mathematical expression (basic arithmetic only).
 */
function calculate(args: { expression: string }): string {
  console.log(`  🛠️  Tool called: calculate(${JSON.stringify(args)})`);
  try {
    const sanitized = args.expression.replace(/[^0-9+\-*/.() ]/g, "");
    // eslint-disable-next-line no-eval
    const result = eval(sanitized);
    return `Result: ${result}`;
  } catch {
    return "Error: invalid expression";
  }
}

/**
 * Execute a bash command in the current workspace.
 * WARNING: this can modify or delete files — use with care!
 */
async function runBash(args: { command: string }): Promise<string> {
  const { exec } = await import("child_process");
  const { promisify } = await import("util");
  const execAsync = promisify(exec);

  console.log(`  🛠️  Tool called: bash(${JSON.stringify(args)})`);
  try {
    const { stdout, stderr } = await execAsync(args.command, {
      timeout: 30_000,
    });
    if (stderr) return `stderr:\n${stderr}\n\nstdout:\n${stdout}`;
    return stdout || "(no output)";
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return `Error: ${message}`;
  }
}

/**
 * Write content to a file in the current workspace.
 * Parent directories are created automatically.
 * Path traversal outside the workspace is rejected.
 */
function writeFile(args: { path: string; content: string }): string {
  console.log(`  🛠️  Tool called: write(${JSON.stringify({ path: args.path, contentLength: args.content.length })})`);
  try {
    const resolved = safePath(args.path);
    const dir = resolve(resolved, "..");
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolved, args.content, "utf-8");
    return `Wrote ${args.content.length} bytes to ${args.path}`;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return `Error: ${message}`;
  }
}

/**
 * Edit a file by replacing the first occurrence of old_text with new_text.
 * Path traversal outside the workspace is rejected.
 */
function editFile(args: { path: string; old_text: string; new_text: string }): string {
  console.log(`  🛠️  Tool called: edit(${JSON.stringify({ path: args.path, old_length: args.old_text.length, new_length: args.new_text.length })})`);
  try {
    const resolved = safePath(args.path);
    const content = readFileSync(resolved, "utf-8");
    if (!content.includes(args.old_text)) {
      return `Error: Text not found in ${args.path}`;
    }
    const updated = content.replace(args.old_text, args.new_text);
    writeFileSync(resolved, updated, "utf-8");
    return `Edited ${args.path}`;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return `Error: ${message}`;
  }
}

/**
 * Read the contents of a file in the current workspace.
 * Path traversal outside the workspace is rejected.
 */
function readFile(args: { path: string; limit?: number }): string {
  console.log(`  🛠️  Tool called: read(${JSON.stringify(args)})`);
  try {
    const resolved = safePath(args.path);
    const text = readFileSync(resolved, "utf-8");
    const lines = text.split("\n");
    if (args.limit !== undefined && args.limit < lines.length) {
      return lines.slice(0, args.limit).join("\n").slice(0, 50_000);
    }
    return text.slice(0, 50_000);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return `Error: ${message}`;
  }
}

/**
 * Load a skill's full body text by name from the skill registry.
 */
function loadSkill(args: { name: string }): string {
  console.log(`  🛠️  Tool called: load_skill(${JSON.stringify(args)})`);
  return defaultRegistry.loadFullText(args.name);
}

function updateTodo(args: { items: RawPlanItem[] }): string {
  console.log(`  🛠️  Tool called: todo(${JSON.stringify({ count: args.items.length })})`);
  try {
    const rendered = todoManager.update(args.items);
    console.log(`\n📋 Plan:\n${rendered}\n`);
    return JSON.stringify({ items: todoManager.items, rounds_since_update: todoManager.roundsSinceUpdate });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return `Error: ${message}`;
  }
}

// ─── Tool Registry ─────────────────────────────────────────────────────────

/**
 * The agent's toolbox. Each tool has:
 *   - definition: JSON schema for the API (native function calling)
 *   - fn:         the runtime implementation
 *
 * To add a new tool, just add an entry to this record.
 */
export const tools: Record<string, Tool> = {
  load_skill: {
    definition: {
      name: "load_skill",
      description: "Load the full body of a named skill into the current context.",
      input_schema: {
        type: "object",
        properties: {
          name: { type: "string" },
        },
        required: ["name"],
      },
    },
    fn: (args: unknown) => loadSkill(args as { name: string }),
  },
  calculate: {
    definition: {
      name: "calculate",
      description: "Evaluate a mathematical expression (e.g. '2 + 3 * 4')",
      input_schema: {
        type: "object",
        properties: {
          expression: {
            type: "string",
            description: "The mathematical expression to evaluate",
          },
        },
        required: ["expression"],
      },
    },
    fn: (args: unknown) => calculate(args as { expression: string }),
  },
  bash: {
    definition: {
      name: "bash",
      description: "Run a shell command in the current workspace.",
      input_schema: {
        type: "object",
        properties: {
          command: { type: "string" },
        },
        required: ["command"],
      },
    },
    fn: (args: unknown) => runBash(args as { command: string }),
  },
  read: {
    definition: {
      name: "read",
      description: "Read the contents of a file in the current workspace. Paths that escape the workspace are rejected.",
      input_schema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Relative or absolute path to the file (must stay within workspace)",
          },
          limit: {
            type: "number",
            description: "Maximum number of lines to read (optional)",
          },
        },
        required: ["path"],
      },
    },
    fn: (args: unknown) => readFile(args as { path: string; limit?: number }),
  },
  write: {
    definition: {
      name: "write",
      description: "Write content to a file in the current workspace. Parent directories are created automatically. Path traversal outside the workspace is rejected.",
      input_schema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Relative or absolute path to the file (must stay within workspace)",
          },
          content: {
            type: "string",
            description: "The content to write to the file",
          },
        },
        required: ["path", "content"],
      },
    },
    fn: (args: unknown) => writeFile(args as { path: string; content: string }),
  },
  edit: {
    definition: {
      name: "edit",
      description: "Edit a file by replacing the first occurrence of old_text with new_text. Path traversal outside the workspace is rejected.",
      input_schema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Relative or absolute path to the file (must stay within workspace)",
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
      },
    },
    fn: (args: unknown) => editFile(args as { path: string; old_text: string; new_text: string }),
  },
  todo: {
    definition: {
      name: "todo",
      description: "Update the current session plan for multi-step work. Use this to create, update, or rewrite the todo list. Only one item can be in_progress at a time.",
      input_schema: {
        type: "object",
        properties: {
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                content: { type: "string", description: "Short description of the task step" },
                status: {
                  type: "string",
                  enum: ["pending", "in_progress", "completed"],
                  description: "pending = not started, in_progress = currently working, completed = done",
                },
                activeForm: {
                  type: "string",
                  description: "Optional present-continuous label shown while the step is in progress",
                },
              },
              required: ["content", "status"],
            },
          },
        },
        required: ["items"],
      },
    },
    fn: (args: unknown) => updateTodo(args as { items: RawPlanItem[] }),
  },
};

/** Return the list of available tool names */
export function listTools(): string[] {
  return Object.keys(tools);
}

/** Return the tool definitions array for the API */
export function getToolDefinitions() {
  return Object.values(tools).map((t) => t.definition);
}