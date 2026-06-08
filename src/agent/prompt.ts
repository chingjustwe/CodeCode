/**
 * System prompt builder. Dynamically includes skill descriptions from the
 * SkillRegistry, persistent memories from the MemoryManager, AGENTS.md chain,
 * and dynamic environment context. Instructs the agent on reasoning, tool usage,
 * and the todo-based planning protocol. Tools themselves are NOT listed here
 * — they are passed via the LLM API's native `tools` parameter for function
 * calling support.
 *
 * Exports:
 * - `buildSystemPrompt()` — returns the complete system prompt string
 * - `buildMemoryPrompt()` — memory guidance + persisted memories section
 * - `buildSkillsPrompt()` — skill usage instructions + available skills list
 * - `buildTodoPrompt()` — todo-based planning protocol
 * - `buildAgentsMdPrompt()` — loads AGENTS.md chain (user-global, project, subdir)
 * - `buildDynamicContext()` — current date, workdir, model, platform info
 *
 * Dependencies:
 * - `./tools/skill/skill-registry.ts` — `defaultRegistry` for skill descriptions
 * - `./tools/memory/memory-manager.ts` — `memoryManager` singleton for memories
 * - `src/utils/constants.ts` — `CODEDIR` for AGENTS.md paths
 */
import { defaultRegistry } from "./tools/skill/skill-registry.js";
import { memoryManager } from "./tools/memory/memory-manager.js";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { cwd } from "process";
import { CODEDIR } from "../utils/constants.js";

function buildMemoryPrompt(): string {
  const memoriesSection = memoryManager.loadMemoryPrompt();
  const guidance = `When to save memories (via the save_memory tool):
- User states a preference ("I like tabs", "always use pytest") -> type: user
- User corrects you ("don't do X", "that was wrong because...") -> type: feedback
- You learn a project fact that is not easy to infer from current code alone
  (for example: a rule exists because of compliance, or a legacy module must
  stay untouched for business reasons) -> type: project
- You learn where an external resource lives (ticket board, dashboard, docs URL)
  -> type: reference
When NOT to save:
- Anything easily derivable from code (function signatures, file structure, directory layout)
- Temporary task state (current branch, open PR numbers, current TODOs)
- Secrets or credentials (API keys, passwords)`;

  const parts = [guidance];
  if (memoriesSection) {
    parts.push(memoriesSection);
  }
  return parts.join("\n\n");
}

/**
 * Load AGENTS.md files in priority order (all are included):
 * 1. {CODEDIR}/AGENTS.md — user-global instructions (analogous to ~/.claude/CLAUDE.md)
 * 2. <project-root>/AGENTS.md — project instructions
 * 3. <current-subdir>/AGENTS.md — directory-specific instructions (if cwd differs)
 */
function buildAgentsMdPrompt(): string {
  const sources: { label: string; content: string }[] = [];
  const workdir = cwd();

  // 1. User-global
  const userPath = resolve(CODEDIR, "AGENTS.md");
  if (existsSync(userPath)) {
    sources.push({ label: `user global (${CODEDIR}/AGENTS.md)`, content: readFileSync(userPath, "utf-8") });
  }

  // 2. Project root
  const projectPath = resolve(workdir, "AGENTS.md");
  if (existsSync(projectPath)) {
    sources.push({ label: "project root (AGENTS.md)", content: readFileSync(projectPath, "utf-8") });
  }

  // 3. Subdirectory — only if cwd is deeper than project root
  const currentCwd = process.cwd();
  if (currentCwd !== workdir) {
    const subdirPath = resolve(currentCwd, "AGENTS.md");
    if (existsSync(subdirPath)) {
      sources.push({ label: `subdir (AGENTS.md in ${currentCwd})`, content: readFileSync(subdirPath, "utf-8") });
    }
  }

  if (sources.length === 0) return "";

  const parts = ["# AGENTS.md instructions"];
  for (const { label, content } of sources) {
    parts.push(`## From ${label}`);
    parts.push(content.trim());
  }
  return parts.join("\n\n");
}

function buildSkillsPrompt(): string {
  const skillsDesc = defaultRegistry.describeAvailable();
  return `Use load_skill when a task needs specialized instructions before you act.
Skills available:
${skillsDesc}

Be concise and direct. If you need to use a tool, call it. If you don't need a tool, answer directly.`;
}

function buildTodoPrompt(): string {
  return `When a task has multiple steps, use the "todo" tool to write out a plan
before starting work. Update the plan after each step:
  - Set the current step to "in_progress" when you begin it.
  - Set it to "completed" when finished, and mark the next step "in_progress".
  - Only one item may be "in_progress" at a time.
This lets the user see your progress in real time.`;
}

/**
 * Dynamic context — always included at the end of the system prompt.
 * Provides the agent with awareness of the current environment.
 */
function buildDynamicContext(): string {
  const now = new Date();
  const dateStr = now.toISOString().split("T")[0];
  const timeStr = now.toTimeString().split(" ")[0];
  return [
    "# Dynamic context",
    `Current date: ${dateStr}`,
    `Current time: ${timeStr}`,
    `Working directory: ${cwd()}`,
    `Model: ${process.env.LLM_MODEL || "default"}`,
    `Platform: ${process.platform} ${process.arch}`,
  ].join("\n");
}

function buildCorePrompt(): string {
  return `You are a helpful AI assistant with access to tools.

For each user request, follow this process:
1. THINK: Reason step-by-step about what the user needs.
2. If a tool can help, call it using the tool calling mechanism.
3. After the tool result comes back, use it to continue reasoning.
4. When you have enough information, provide a clear final answer.`;
}

/**
 * Build the system prompt that tells the agent how to think and act.
 *
 * The available tools are NOT listed here — they are passed via the API's
 * native `tools` parameter so the model sees them as structured tool definitions
 * and uses function calling instead of string parsing.
 */
export function buildSystemPrompt(): string {
  const parts: string[] = [
    buildCorePrompt(),
    buildSkillsPrompt(),
    buildTodoPrompt(),
    buildMemoryPrompt(),
    buildAgentsMdPrompt(),
    buildDynamicContext(),
  ];

  // Filter out empty sections (e.g. when no AGENTS.md files exist)
  const nonEmpty = parts.filter((p) => p.length > 0);
  return nonEmpty.join("\n\n");
}
