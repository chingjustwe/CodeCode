# CodeCode — Agent Instructions

TypeScript 6.0 / ES modules / zero-runtime-dep (dotenv only).  
Entry: `src/index.ts` → `createModel()` → `startRepl()` → `agentLoop()`.

## Code Commenting Rules (MUST follow)

These rules apply to all code files (.ts, .js, .py, .tsx, etc.) created or modified by the agent:

### Creating new files

Every new code file MUST start with a top-level JSDoc (or equivalent) comment that describes:

- **What the file is for** — the module's purpose and responsibility
- **Key exports** — what classes, functions, or types it exposes (one-line summary each)
- **Relationships** — which other modules it depends on or is consumed by (if non-obvious)

Example:

```typescript
/**
 * Manages the tool registry: loads all built-in tools and provides
 * lookup by name. Used by the agent loop to discover available tools.
 *
 * Exports:
 * - `getToolDefinitions()` — returns all tool definitions for the LLM API
 * - `executeTool(name, args)` — runs a tool by name with given arguments
 */
```

Exceptions: trivial files (a single type export, re-export barrel files like `index.ts`) may use a shorter one-liner.

### Modifying existing files

When modifying an existing file, the agent MUST check whether the file's top-level comment still accurately describes the module after the change. If the purpose, exports, or relationships have changed, update the comment accordingly.

### What counts as a "change" that requires comment review

- Adding, removing, or renaming exported functions/classes/types
- Changing the module's core responsibility or behavior
- Adding or removing significant dependencies
- Refactoring that splits or merges logic across files

### One class per file rule

Every exported class MUST reside in its own file. A file may contain multiple functions, type
aliases, interfaces, and constants — but if it exports a class, that class must be the sole
exported class in the file. (Trivial helper classes used only within the same file are exempt.)

Rationale: keeps the codebase navigable, makes git history per-class, and avoids merge conflicts
when multiple classes in the same module change.

### What does NOT require comment review

- Bug fixes that don't alter the module's public API or core purpose
- Internal refactoring that doesn't change exported interfaces
- Adding helper/utility functions that serve the existing purpose
- Importing new dependencies for internal use (the dependency list in the comment is optional, not required)

### General documentation check (MUST follow)

Every code change MUST also consider whether `AGENTS.md` and `README.md` need corresponding updates:
- If the change adds, removes, or renames a command, tool, provider, or skill — update the relevant section in `AGENTS.md`.
- If the change affects how the project is set up, built, run, or deployed — update `README.md`.
- If the change introduces a new architectural concept or modifies an existing one (e.g., agent loop behavior, prompt construction, sandboxing rules) — ensure `AGENTS.md` reflects it.
- If neither file needs changes, no action required — but the agent MUST explicitly note this in its reasoning.

### Barrel files (`index.ts`)

Barrel (re-export) files should have a comment listing what they re-export from, e.g.:

```typescript
/**
 * Barrel — re-exports all tools and the registry.
 * Usage: `import { getToolDefinitions } from './tools'`
 */
```

## Commands

| Command | What it does |
|---|---|
| `npm start` | Run with default (anthropic) provider |
| `npm run dev` | Run with `--watch` (auto-restart on edits) |
| `npm run openai` | `LLM_PROVIDER=openai npx tsx src/index.ts` |
| `npm run deepseek` | Same pattern for DeepSeek |
| `npm run minimax` | Same pattern for MiniMax |
| `npm run kimi` | Same pattern for Kimi |
| `npm run glm` | Same pattern for GLM |
| `npm run typecheck` | `tsc --noEmit` — the **only** verification (no tests, no linter, no formatter) |
| `npm run build` | `tsc` → `dist/` |

## Setup

1. `cp .env.example .env`
2. Add API key(s). `LLM_PROVIDER` selects the provider (default `anthropic`).
3. `npm install && npm start`

### Env vars

| Var | Purpose |
|---|---|
| `LLM_PROVIDER` | Selects the provider (default `anthropic`) |
| `LLM_MODEL` | Overrides the default model name |
| `LLM_CONTEXT_WINDOW` | Overrides context window size for token % display |
| `LLM_TEMPERATURE` | Overrides the default temperature |
| `LLM_API_KEY` | Fallback API key (takes priority over provider-specific) |
| `{PROVIDER}_API_KEY` | Provider-specific API key |

## Architecture (not obvious from filenames)

- **Provider dispatch**: by `apiFramework` field (`"openai"` | `"anthropic"`), not by provider name. Adding a provider config in `src/llm/providers.ts` is enough — no new class needed if framework is already supported.
- **Tool definition**: each entry in `src/agent/tools/` has a JSON Schema `definition` + runtime `fn`. Tools reachable from `getToolDefinitions()` / the `tools` record. Tools are organized by category — e.g. `src/agent/tools/todo/` contains both `todo.ts` (manager) and `todo-tool.ts` (tool class).
- **Skill system**: skills live at `.agents/skills/<name>/SKILL.md`. Optional YAML frontmatter (`name:`, `description:`). Loaded by `SkillRegistry` at startup — subdirs without `SKILL.md` are ignored.
- **Agent loop** (`src/agent/loop.ts`): max 20 iterations, 8096 max_tokens per call. Tool results fed back as `HumanMessage` (no `ToolMessage` type used — matches OpenAI's user-message convention). After each turn, accumulated token usage (input + output + % of context window) is printed to console.
- **System prompt** (`src/agent/prompt.ts`): dynamically includes available skill descriptions. Not a static string.
- **Context compression** (`src/agent/compact/index.ts`): three-layer compression applied via `CompactListener` (registered in `src/index.ts` as a loop listener). Layer 1 (`onBeforeToolResult`) writes large tool outputs (>4 KB) to `.task_outputs/tool-results/` with a preview in context. Layer 2 (`onRoundStart`) replaces all but the last 3 tool-result messages with `[Earlier tool result omitted for brevity]` at the start of each round. Layer 3 (used by `/compact`) produces an LLM continuity summary that replaces the full history. The output dirs are gitignored by default.
- **File sandboxing**: `safePath()` in `src/utils/file-utils.ts` resolves paths relative to `cwd()` and rejects traversal (`../../etc`).

## Quirks & gotchas

- `LLM_API_KEY` takes priority over `{PROVIDER}_API_KEY` (opposite of what `.env.example` comment suggests). If both are set, `LLM_API_KEY` wins.
- Anthropic API version header hardcoded to `2023-06-01` in `AnthropicChatModel`.
- `read` caps output at 50 KB, `bash` has a 30s hardcoded timeout, `edit` replaces **first occurrence only**.
- `calculate` uses sanitized `eval` — only `0-9+\-*/.() ` characters pass through.
- No tests, no linter, no formatter configured. `typecheck` is the sole quality gate.
- `.env` is gitignored.
- `LLM_CONTEXT_WINDOW` overrides the model's context window for token % display.

## Adding a Provider

Add an entry to `src/llm/providers.ts` specifying `endpoint`, `defaultModel`, `envKey`, and `apiFramework` (`"openai"` or `"anthropic"`). Set `{NAME}_API_KEY` in `.env`, then run with `LLM_PROVIDER=<name> npm start`.

## Adding a Tool

Create a new `.ts` file in `src/agent/tools/` (or a subdirectory if it belongs to a category) that exports a class extending `BaseTool`. Then register it in `src/agent/tools/index.ts`. The agent loop auto-includes it on the next API call.
