# CodeCode

**CodeCode** is a minimal, scratch-built AI coding agent client written in TypeScript, inspired by [Claude Code](https://github.com/anthropics/claude-code) and [Open Code](https://github.com/sst/open-code).

> **Why build from scratch?**  
> To deeply understand how coding agents work under the hood — tool-calling loops, multi-provider LLM integration, and file-system tooling — without any framework abstraction like LangChain.

## Features

- 🧠 **Multi-provider LLM support** — OpenAI, DeepSeek, MiniMax, Kimi (OpenAI-compatible), and Anthropic / Claude
- 🛠️ **Native tool calling** — tools are defined as JSON schemas and dispatched by the LLM natively (no string parsing)
- 📁 **Workspace-aware file operations** — read, write, edit files with path-traversal protection
- 🐚 **Bash execution** — run shell commands inside the current workspace  
- 🧮 **Calculator** — evaluate mathematical expressions
- 🔄 **Agent loop** — the LLM autonomously decides which tool to call, receives results, and iterates until the task is done
- 🏗️ **Zero LangChain dependency** — a single runtime dependency (`dotenv`) + TypeScript toolchain

## Quick start

```bash
# Install dependencies
npm install

# Copy environment config and add your API keys
cp .env.example .env
# Edit .env with your provider API key and preferred model

# Start the REPL
npm start
```

### Select a provider

```bash
# Default (Anthropic Claude)
npm start

# OpenAI
npm run openai

# DeepSeek
npm run deepseek

# MiniMax
npm run minimax

# Kimi
npm run kimi
```

### Environment variables

| Variable | Description |
|---|---|
| `LLM_PROVIDER` | Provider name: `openai`, `anthropic`, `deepseek`, `minimax`, `kimi`, `claude` (alias for `anthropic`) |
| `OPENAI_API_KEY` | OpenAI / DeepSeek / MiniMax / Kimi API key |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `LLM_MODEL` | (Optional) Override the default model for the selected provider |

## Architecture

```
src/
├── index.ts              # Entry point
├── agent/
│   ├── loop.ts           # Agent loop — orchestrates tool calls
│   ├── prompt.ts         # System prompt builder
│   └── tools.ts          # Tool registry & implementations
├── cli/
│   └── repl.ts           # Interactive REPL
├── llm/
│   ├── factory.ts        # Model factory (dispatches by API framework)
│   ├── providers.ts      # Provider configuration
│   ├── openai-chat-model.ts   # OpenAI-compatible API client
│   └── anthropic-chat-model.ts # Anthropic API client
└── types/
    ├── index.ts          # Shared types & interfaces
    └── messages.ts       # Message classes
```

### How it works

1. The **agent loop** (`loop.ts`) sends the conversation + available tool definitions to the LLM
2. The LLM responds with either a text reply or one or more **tool calls**
3. If tool calls are requested, the loop executes them via the **tool registry** (`tools.ts`) and feeds results back to the LLM
4. This continues until the LLM produces a final text response

## Tools

| Tool | Description |
|---|---|
| `calculate` | Evaluate a mathematical expression |
| `bash` | Run a shell command in the current workspace |
| `read` | Read the contents of a file |
| `write` | Write content to a file (creates parent dirs) |
| `edit` | Replace the first occurrence of text in a file |

All file operations are sandboxed to the current workspace — paths that escape via `..` traversal are rejected.

## Development

```bash
# TypeScript compilation check
npm run typecheck

# Build
npm run build
```

## License

ISC