# Agent Architecture

This document describes the internal architecture of CodeCode's agent system — how the LLM is orchestrated, how tools are dispatched, and how each component fits together.

## Core Idea

CodeCode is a **tool-calling agent** built on a simple loop:

```
┌──────────────────────────────────────────────────┐
│                  Agent Loop                       │
│                                                    │
│  User Message ──► LLM ──► Tool Call? ──► Execute  │
│                         │            │             │
│                         │ No         │ Result      │
│                         ▼            ▼             │
│                     Response ◄─── LLM (again)      │
└──────────────────────────────────────────────────┘
```

The agent has **no hardcoded logic** about what to do — it sends the conversation history along with tool definitions to the LLM, and the LLM decides which tool to call (if any). This is the same pattern used by Claude Code, OpenAI Code Interpreter, and similar coding agents.

## Key Components

### 1. ChatModel Interface (`src/types/index.ts`)

Every LLM provider implements this interface:

```typescript
interface ChatModel {
  modelName: string;
  invoke(params: ChatCompletionParams): Promise<ChatCompletionResult>;
}
```

The `invoke` method accepts:
- `messages` — conversation history (HumanMessage, AIMessage, SystemMessage)
- `system` — optional system prompt override
- `tools` — optional JSON schema tool definitions
- `maxTokens` — optional response length limit

This uniform interface lets the agent loop work with any provider without knowing the underlying API details.

### 2. Provider Abstraction (`src/llm/`)

Providers are classified by **API framework**, not by name:

| Framework | API Pattern | Implemented By |
|---|---|---|
| `openai` | `POST /v1/chat/completions` | `OpenAIChatModel` |
| `anthropic` | `POST /v1/messages` | `AnthropicChatModel` |

The factory (`factory.ts`) dispatches based on the provider's `apiFramework` field:

```typescript
export function createModel(provider: ProviderConfig): ChatModel {
  switch (provider.apiFramework) {
    case "openai":    return new OpenAIChatModel(provider);
    case "anthropic": return new AnthropicChatModel(provider);
  }
}
```

This makes it trivial to add new providers that use either framework — just add a config entry in `providers.ts`.

### 3. Tool Registry (`src/agent/tools.ts`)

Tools are defined as a `Record<string, Tool>`, where each tool has:

```typescript
interface Tool {
  definition: ToolDefinition;  // JSON schema for the LLM
  fn: (args: unknown) => string | Promise<string>;  // Implementation
}
```

The `definition` is sent to the LLM as part of the API call. The LLM sees tool names, descriptions, and input schemas — it decides which tool to call and with what arguments. The registry then dispatches to the corresponding `fn`.

Adding a new tool is as simple as:

```typescript
export const tools: Record<string, Tool> = {
  myTool: {
    definition: {
      name: "myTool",
      description: "What this tool does",
      input_schema: {
        type: "object",
        properties: {
          arg1: { type: "string" },
        },
        required: ["arg1"],
      },
    },
    fn: (args) => myToolImplementation(args as { arg1: string }),
  },
};
```

### 4. Agent Loop (`src/agent/loop.ts`)

The loop is the brain of the agent. Pseudocode:

```
function agentLoop(userInput, history):
  add userInput to history as HumanMessage
  while True:
    response = model.invoke({ messages: history, tools: toolDefinitions })
    if response has tool_calls:
      for each tool_call:
        result = tools[tool_call.name].fn(tool_call.args)
        add result to history as ToolMessage
    else:
      add response text to history as AIMessage
      return response text
```

Key design decisions:
- **Single-turn tool execution** — all tool calls in one LLM response are executed before calling the LLM again
- **Full history** — every message (user, assistant, tool result) is preserved, giving the LLM complete context
- **No hardcoded tool logic** — the LLM decides everything; the loop is purely mechanical

### 5. File System Safety (`src/agent/tools.ts`)

All file tools (`read`, `write`, `edit`) use a `safePath()` guard:

```typescript
const WORKDIR = cwd();

function safePath(p: string): string {
  const path = resolve(WORKDIR, p);
  if (!path.startsWith(WORKDIR)) {
    throw new Error(`Path escapes workspace: ${p}`);
  }
  return path;
}
```

This ensures the agent cannot read or modify files outside the current working directory, even if the LLM attempts path traversal (e.g., `../../etc/passwd`).

## Adding a New Provider

1. Add config to `src/llm/providers.ts`:

```typescript
myProvider: {
  name: "My Provider",
  endpoint: "https://api.myprovider.com/v1",
  defaultModel: "my-model",
  envKey: "MY_API_KEY",
  apiFramework: "openai",  // or "anthropic"
},
```

2. Set `MY_API_KEY` in `.env` and run with `LLM_PROVIDER=myProvider npm start`

## Adding a New Tool

1. Write the implementation function in `src/agent/tools.ts`
2. Add an entry to the `tools` record with its JSON schema definition
3. Done — the agent loop automatically includes it in the next API call

## Message Types

| Type | Role | Content |
|---|---|---|
| `SystemMessage` | System prompt | Instructions that guide LLM behavior |
| `HumanMessage` | User | The user's input |
| `AIMessage` | Assistant | The LLM's text response (may also contain tool calls) |
| `ToolMessage` | Tool result | The output from executing a tool |