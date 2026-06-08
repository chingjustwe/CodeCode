/**
 * System prompt builder. Dynamically includes skill descriptions from the
 * SkillRegistry, persistent memories from the MemoryManager, and instructs
 * the agent on reasoning, tool usage, and the todo-based planning protocol.
 * Tools themselves are NOT listed here — they are passed via the LLM API's
 * native `tools` parameter for function calling support.
 *
 * Exports:
 * - `buildSystemPrompt()` — returns the complete system prompt string
 * - `buildMemoryPrompt()` — memory guidance + persisted memories section
 * - `buildSkillsPrompt()` — skill usage instructions + available skills list
 * - `buildTodoPrompt()` — todo-based planning protocol
 *
 * Dependencies:
 * - `./tools/skill/skill-registry.ts` — `defaultRegistry` for skill descriptions
 * - `./tools/memory/memory-manager.ts` — `memoryManager` singleton for memories
 */
import { defaultRegistry } from "./tools/skill/skill-registry.js";
import { memoryManager } from "./tools/memory/memory-manager.js";

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
  ];

  return parts.join("\n\n");
}
