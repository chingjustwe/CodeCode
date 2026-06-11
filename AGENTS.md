# CodeCode — Agent Instructions

TypeScript 6.0 / ES modules / minimal runtime deps (dotenv + js-yaml).  
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
| `npm run openrouter` | `LLM_PROVIDER=openrouter npx tsx src/index.ts` (requires `codecode.yml`) |
| `npm run typecheck` | `tsc --noEmit` — the **only** verification (no tests, no linter, no formatter) |
| `npm run build` | `tsc` → `dist/` |

## Setup

1. `cp .env.example .env`
2. Add API key(s). `LLM_PROVIDER` selects the provider (default `anthropic`).
3. `npm install && npm start`

### Config file (`codecode.yml`)

An optional YAML config file can be placed in the project root (or `{CODEDIR}/codecode.yml`).
Providers defined there are merged into the built-in provider list — no code changes needed
to add a new provider. If a YAML provider name matches a built-in one, the YAML config wins
(useful for overriding endpoints for self-hosted services like Ollama/vLLM).

### Env vars

| Var | Purpose |
|---|---|---|
| `CODEDIR` | CodeCode working/config directory (default `.codecode`) |
| `LLM_PROVIDER` | Selects the provider (default `anthropic`) |
| `LLM_MODEL` | Overrides the default model name |
| `LLM_CONTEXT_WINDOW` | Overrides context window size for token % display |
| `LLM_TEMPERATURE` | Overrides the default temperature |
| `LLM_API_KEY` | Fallback API key (takes priority over provider-specific) |
| `{PROVIDER}_API_KEY` | Provider-specific API key |

## Architecture (not obvious from filenames)

- **Provider dispatch**: by `apiFramework` field (`"openai"` | `"anthropic"`), not by provider name. Adding a provider config in `src/llm/providers.ts` or via `codecode.yml` is enough — no new class needed if framework is already supported.
- **YAML config** (`src/config/config-loader.ts`): loads `codecode.yml` at startup, merges YAML-defined providers into the built-in `PROVIDERS` record. The `buildProviderRecord()` function in `src/llm/providers.ts` calls `loadConfig()` at module init time.
- **Tool definition**: each entry in `src/agent/tools/` has a JSON Schema `definition` + runtime `fn`. Tools reachable from `getToolDefinitions()` / the `tools` record. Tools are organized by category — e.g. `src/agent/tools/todo/` contains both `todo.ts` (manager) and `todo-tool.ts` (tool class).
- **CODEDIR**: `src/utils/constants.ts` exports `CODEDIR` — the working/config directory path (default `.codecode/`, customizable via `CODEDIR` env var). Skills, transcripts, and persisted tool outputs live under this directory.
- **Skill system**: skills live at `{CODEDIR}/skills/<name>/SKILL.md` or `.agents/skills/<name>/SKILL.md`. Both directories are scanned by `SkillRegistry` at startup — subdirs without `SKILL.md` are ignored.
- **Agent loop** (`src/agent/loop.ts`): max 20 iterations, 8096 max_tokens per call. Tool results fed back as `HumanMessage` (no `ToolMessage` type used — matches OpenAI's user-message convention). After each turn, accumulated token usage (input + output + % of context window) is printed to console.
- **System prompt** (`src/agent/prompt.ts`): dynamically includes available skill descriptions, persistent memories, an AGENTS.md chain (user-global, project-root, and subdirectory levels), and dynamic environment context (date, workdir, model, platform). The six major sections feed into `buildSystemPrompt()` in order: core identity, skills, todo protocol, memory guidance, AGENTS.md instructions, and dynamic context. Empty sections (e.g. when no AGENTS.md files exist) are filtered out automatically.
- **Context compression** (`src/agent/compact/index.ts`): three-layer compression applied via `CompactListener` (registered in `src/index.ts` as a loop listener). Layer 1 (`onBeforeToolResult`) writes large tool outputs (>4 KB) to `{CODEDIR}/tool-results/` with a preview in context. Layer 2 (`onRoundStart`) replaces all but the last 3 tool-result messages with `[Earlier tool result omitted for brevity]` at the start of each round. Layer 3 (used by `/compact`) produces an LLM continuity summary that replaces the full history. The output dirs are gitignored by default.
- **Memory system** (`src/memory/memory-manager.ts`): stores persistent memories across sessions. Four types: `user` (preferences), `feedback` (corrections), `project` (non-obvious project facts), `reference` (external resource URLs). Each memory is a Markdown file with YAML frontmatter under `{CODEDIR}/memory/`. The `save_memory` tool (registered in `src/agent/tools/memory/save-memory-tool.ts`) lets the LLM persist a memory mid-conversation. At startup, `memoryManager.loadAll()` loads existing memories, and `buildSystemPrompt()` injects them into the system prompt on every agent loop invocation.
- **File sandboxing**: `safePath()` in `src/utils/file-utils.ts` resolves paths relative to `cwd()` and rejects traversal (`../../etc`).
- **Permission system** (`src/agent/permission-manager.ts`): checks tool calls against deny rules before execution. Registered as a `LoopListener` in `src/index.ts`. The `onBeforeToolCall` hook fires before each tool invocation; if a rule matches, the tool is skipped and a denial message is fed back to the LLM. `ask` mode is reserved for future subagent-based approval. Default rules block `sudo`, destructive commands (`rm -rf /`, `dd`, `mkfs*`, `shutdown`), network commands (`wget`, `curl`, `ssh`, `scp`), user/group management, and writes to `/etc/*`.

## Quirks & gotchas

- `LLM_API_KEY` takes priority over `{PROVIDER}_API_KEY` (opposite of what `.env.example` comment suggests). If both are set, `LLM_API_KEY` wins.
- Anthropic API version header hardcoded to `2023-06-01` in `AnthropicChatModel`.
- `read` caps output at 50 KB, `bash` has a 30s hardcoded timeout, `edit` replaces **first occurrence only**.
- `calculate` uses sanitized `eval` — only `0-9+\-*/.() ` characters pass through.
- No tests, no linter, no formatter configured. `typecheck` is the sole quality gate.
- `.env` is gitignored.
- `LLM_CONTEXT_WINDOW` overrides the model's context window for token % display.

## Subagent system (`src/agent/subagent/`)

Subagents provide isolated LLM contexts for complex sub-tasks. The parent agent
uses the `dispatch_task` tool to spawn a subagent with a fresh message history
and restricted toolset; only the final summary is returned.

- **Run loop** (`src/agent/subagent/subagent.ts`): `runSubagent(prompt, model, registry)`
  creates a clean `messages[]`, invokes the LLM with `SUBAGENT_SYSTEM`, processes
  tool calls, and returns the final text when the model responds without tools.
- **Tools**: subagents get a strict subset — `read`, `bash` (read-only — write
  commands like `rm`, `mv`, `>`, `|`, `curl` are rejected at runtime), and
  `calculate`. No `write`, `edit`, `todo`, `save_memory`, or `dispatch_task`.
- **Safety limits**: max 30 LLM turns per subagent. A tool error immediately
  terminates the subagent and returns an error summary.
- **Tool registration** (`DispatchTaskTool` in `src/agent/subagent/subagent-tool.ts`):
  registered like any other tool but requires `DispatchTaskTool.init(model, registry)`
  at startup (done in `src/index.ts`). The parent agent sees `dispatch_task` in its
  tool list; subagents never see it (it's excluded from `SUBAGENT_TOOL_NAMES`).

## Adding a Provider

There are two ways to add a provider:

### Via YAML config (recommended)

Add an entry under `providers:` in `codecode.yml` (create one if it doesn't exist).
No code changes needed. Example:

```yaml
providers:
  openrouter:
    endpoint: https://openrouter.ai/api/v1
    defaultModel: google/gemini-2.5-pro-exp-03-25:free
    envKey: OPENROUTER_API_KEY
    apiFramework: openai
    contextWindow: 128000
```

Set `{NAME}_API_KEY` in `.env` (or use `LLM_API_KEY` as a fallback),
then run with `LLM_PROVIDER=<name> npm start`.

### Via code (for complex providers)

Add an entry to `src/llm/providers.ts` specifying `endpoint`, `defaultModel`, `envKey`,
and `apiFramework` (`"openai"` or `"anthropic"`). Same env var + startup procedure.

## Adding a Tool

Create a new `.ts` file in `src/agent/tools/` (or a subdirectory if it belongs to a category) that exports a class extending `BaseTool`. Then register it in `src/agent/tools/index.ts`. The agent loop auto-includes it on the next API call.
