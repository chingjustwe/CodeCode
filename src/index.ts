/**
 * Application entry point — bootstraps the LLM model, registers all tools and
 * commands, attaches the todo manager as a loop listener, then starts the REPL.
 *
 * Exports: none (runs as the main module)
 *
 * Side-effect imports:
 *   - `./agent/tools/index.js` — registers all built-in tools with the registry
 *   - `./agent/commands/index.js` — registers all CLI commands
 *
 * Config (optional, YAML):
 *   `codecode.yml` in the project root (or `{CODEDIR}/codecode.yml`).
 *   See codecode.yml for documentation. Providers defined there are merged
 *   into the built-in provider list — no code changes needed to add a provider.
 *
 * Env vars (via dotenv):
 *   LLM_PROVIDER  — provider name (openai | deepseek | minimax | kimi | glm | anthropic | claude | openrouter)
 *   LLM_API_KEY   — API key (or set the provider-specific env var, e.g. OPENAI_API_KEY)
 *   LLM_MODEL     — override the default model name
 *
 * Usage:
 *   LLM_PROVIDER=openai     LLM_API_KEY=sk-xxx npm start
 *   LLM_PROVIDER=deepseek   LLM_API_KEY=sk-xxx npm start
 *   LLM_PROVIDER=minimax    LLM_API_KEY=sk-xxx npm start
 *   LLM_PROVIDER=kimi       LLM_API_KEY=sk-xxx npm start
 *   LLM_PROVIDER=anthropic  LLM_API_KEY=sk-ant-xxx npm start
 *   LLM_PROVIDER=glm        LLM_API_KEY=xxx npm start
 *   LLM_PROVIDER=openrouter LLM_API_KEY=sk-or-v1-xxx npm start
 *
 * Or create a .env file (copy from .env.example) and just run:
 *   npm start
 */

import "./agent/commands/index.js";
import { compactListener } from "./agent/compact/compact-listener.js";
import { registerLoopListener } from "./agent/hooks.js";
import { usageTracker } from "./agent/hooks/usage-hook.js";
import { permissionManager } from "./agent/permission-manager.js";
import "./agent/tools/index.js";
import { memoryManager } from "./agent/tools/memory/memory-manager.js";
import { todoManager } from "./agent/tools/todo/todo.js";
import { toolRegistry } from "./agent/tools/tool-registry.js";
import { startRepl } from "./cli/repl.js";
import { createModel } from "./llm/factory.js";

// ─── Bootstrap ─────────────────────────────────────────────────────────────

memoryManager.loadAll();
const model = createModel();

registerLoopListener(todoManager);
registerLoopListener(compactListener);
registerLoopListener(permissionManager);
registerLoopListener(usageTracker);

// ─── Start ─────────────────────────────────────────────────────────────────

startRepl(model, toolRegistry).catch(console.error);