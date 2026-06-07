# CodeCode — Agent Instructions

TypeScript 6.0 / ES modules / zero-runtime-dep (dotenv only).  
Entry: `src/index.ts` → `createModel()` → `startRepl()` → `agentLoop()`.

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

## Architecture (not obvious from filenames)

- **Provider dispatch**: by `apiFramework` field (`"openai"` | `"anthropic"`), not by provider name. Adding a provider config in `src/llm/providers.ts` is enough — no new class needed if framework is already supported.
- **Tool definition**: each entry in `src/agent/tools.ts` has a JSON Schema `definition` + runtime `fn`. Tools reachable from `getToolDefinitions()` / the `tools` record.
- **Skill system**: skills live at `.agents/skills/<name>/SKILL.md`. Optional YAML frontmatter (`name:`, `description:`). Loaded by `SkillRegistry` at startup — subdirs without `SKILL.md` are ignored.
- **Agent loop** (`src/agent/loop.ts`): max 20 iterations, 8096 max_tokens per call. Tool results fed back as `HumanMessage` (no `ToolMessage` type used — matches OpenAI's user-message convention).
- **System prompt** (`src/agent/prompt.ts`): dynamically includes available skill descriptions. Not a static string.
- **File sandboxing**: `safePath()` in `src/agent/tools.ts` resolves paths relative to `cwd()` and rejects traversal (`../../etc`).

## Quirks & gotchas

- `LLM_API_KEY` takes priority over `{PROVIDER}_API_KEY` (opposite of what `.env.example` comment suggests). If both are set, `LLM_API_KEY` wins.
- Anthropic API version header hardcoded to `2023-06-01` in `AnthropicChatModel`.
- `read` caps output at 50 KB, `bash` has a 30s hardcoded timeout, `edit` replaces **first occurrence only**.
- `calculate` uses sanitized `eval` — only `0-9+\-*/.() ` characters pass through.
- No tests, no linter, no formatter configured. `typecheck` is the sole quality gate.
- `.env` is gitignored.

## Adding a Provider

Add an entry to `src/llm/providers.ts` specifying `endpoint`, `defaultModel`, `envKey`, and `apiFramework` (`"openai"` or `"anthropic"`). Set `{NAME}_API_KEY` in `.env`, then run with `LLM_PROVIDER=<name> npm start`.

## Adding a Tool

Add an entry to the `tools` record in `src/agent/tools.ts` with `definition` (JSON schema) and `fn` (implementation). The agent loop auto-includes it on the next API call.
