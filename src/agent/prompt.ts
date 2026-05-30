/**
 * Build the system prompt that tells the agent how to think and act.
 *
 * The available tools are NOT listed here — they are passed via the API's
 * native `tools` parameter so the model sees them as structured tool definitions
 * and uses function calling instead of string parsing.
 */
export function buildSystemPrompt(): string {
  return `You are a helpful AI assistant with access to tools.

For each user request, follow this process:
1. THINK: Reason step-by-step about what the user needs.
2. If a tool can help, call it using the tool calling mechanism.
3. After the tool result comes back, use it to continue reasoning.
4. When you have enough information, provide a clear final answer.

Be concise and direct. If you need to use a tool, call it. If you don't need a tool, answer directly.`;
}