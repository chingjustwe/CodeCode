/**
 * Custom message types — replacement for @langchain/core/messages.
 *
 * These are simplified versions that cover the same interface we use
 * in the agent loop (Human, System, AI messages with string content).
 */

export type MessageRole = "system" | "user" | "assistant";

/**
 * Base message interface.
 * All message types share this shape.
 */
export interface BaseMessageFields {
  content: string;
  role: MessageRole;
}

export class BaseMessage {
  content: string;
  role: MessageRole;

  constructor(fields: BaseMessageFields) {
    this.content = fields.content;
    this.role = fields.role;
  }
}

export class HumanMessage extends BaseMessage {
  constructor(content: string) {
    super({ content, role: "user" });
  }
}

export class AIMessage extends BaseMessage {
  constructor(content: string) {
    super({ content, role: "assistant" });
  }
}

export class SystemMessage extends BaseMessage {
  constructor(content: string) {
    super({ content, role: "system" });
  }
}