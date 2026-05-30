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
import { tools } from "./agent/tools.js";
import { startRepl } from "./cli/repl.js";

// ─── Bootstrap ─────────────────────────────────────────────────────────────

const model = createModel();

// ─── Start ─────────────────────────────────────────────────────────────────

startRepl(model, tools).catch(console.error);