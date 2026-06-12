/**
 * `/list` command — lists all persisted chat sessions with metadata
 * (creation time, message count, title). The current session is marked.
 *
 * Exports:
 * - `ListSessionsCommand` — class extending `Command`
 *
 * Dependencies:
 * - `sessionManager` — from `../../session/session-manager.js`
 *
 * Registered in: `src/agent/commands/index.ts`
 */
import { Command } from "./command.js";
import { sessionManager } from "../../session/session-manager.js";

export class ListSessionsCommand extends Command {
  readonly name = "list";
  readonly description = "List all chat sessions";
  readonly aliases = ["ls"];
  readonly usage = "/list";

  execute(): string {
    const sessions = sessionManager.list();
    if (sessions.length === 0) {
      return "No sessions found.";
    }

    const currentId = sessionManager.getCurrentId();
    const lines: string[] = [];
    lines.push("┌─────────────────────────────────────────────────────────────┐");
    lines.push("│                     Chat Sessions                           │");
    lines.push("└─────────────────────────────────────────────────────────────┘");
    lines.push("");

    for (const s of sessions) {
      const marker = s.id === currentId ? "  ← current" : "";
      const date = new Date(s.updatedAt).toLocaleString();
      const count = `${s.messageCount} message${s.messageCount !== 1 ? "s" : ""}`;
      const title = s.title || "(no title)";
      lines.push(`  ${s.id}`);
      lines.push(`    ${date}  ·  ${count}  ·  ${title}${marker}`);
      lines.push("");
    }

    return lines.join("\n");
  }
}
