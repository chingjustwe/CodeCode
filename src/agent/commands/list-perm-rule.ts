/**
 * `/list-perm-rule` command — lists all permission rules currently active
 * in the permission manager. Reads rules via `permissionManager.getRules()`.
 *
 * Exports:
 * - `ListPermRuleCommand` — class extending `Command`
 *
 * Dependencies:
 * - `permissionManager` (from `../permission-manager.js`) — singleton
 *
 * Registered in: `src/agent/commands/index.ts`
 */
import { Command } from "./command.js";
import { permissionManager } from "../permission-manager.js";

export class ListPermRuleCommand extends Command {
  readonly name = "list-perm-rule";
  readonly description = "List all permission rules";
  readonly aliases = ["lpr"];
  readonly usage = "/list-perm-rule";

  execute(_args: string[]): string {
    const rules = permissionManager.getRules();
    if (rules.length === 0) {
      return "No permission rules configured.";
    }

    const lines: string[] = [];
    lines.push(`Permission Rules (${rules.length}):`);
    lines.push("");
    for (let i = 0; i < rules.length; i++) {
      const r = rules[i];
      const parts: string[] = [];
      if (r.tool) parts.push(`tool="${r.tool}"`);
      if (r.content) parts.push(`content="${r.content}"`);
      if (r.path) parts.push(`path="${r.path}"`);
      parts.push(`→ ${r.behavior}`);
      lines.push(`  ${i + 1}. ${parts.join(" ")}`);
    }
    return lines.join("\n");
  }
}
