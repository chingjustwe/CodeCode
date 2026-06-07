/**
 * LangChain.js Hello World AI Agent — Entry Point
 *
 * Supports multiple LLM providers via environment variables:
 *   LLM_PROVIDER  — provider name (openai | deepseek | minimax | kimi)
 *   LLM_API_KEY   — API key (or set the provider-specific env var)
 *   LLM_MODEL     — override the default model name
 *
 * Usage:
 *   LLM_PROVIDER=openai   LLM_API_KEY=sk-xxx npm start
 *   LLM_PROVIDER=deepseek LLM_API_KEY=sk-xxx npm start
 *   LLM_PROVIDER=minimax  LLM_API_KEY=sk-xxx npm start
 *   LLM_PROVIDER=kimi     LLM_API_KEY=sk-xxx npm start
 *
 * Or create a .env file (copy from .env.example) and just run:
 *   npm start
 */

import { createModel } from "./llm/factory.js";
import { toolRegistry } from "./agent/tool-registry.js";
import "./agent/tools/index.js";
import { startRepl } from "./cli/repl.js";
import { registerLoopListener } from "./agent/hooks.js";
import { todoManager } from "./agent/tools/todo/todo.js";

// ─── Bootstrap ─────────────────────────────────────────────────────────────

const model = createModel();

registerLoopListener(todoManager);

// ─── Start ─────────────────────────────────────────────────────────────────

startRepl(model, toolRegistry).catch(console.error);