/**
 * Permission system for tool calls. Defines rules that deny dangerous
 * operations before execution. Rules are checked in order — first match
 * wins. Only "allow" and "deny" behaviors are implemented; "ask" is a
 * placeholder for future subagent-based approval.
 *
 * Exports:
 * - `PermissionManager` — class; implements LoopListener via onBeforeToolCall
 * - `permissionManager` — singleton instance used by the agent loop
 *
 * Used by: `src/index.ts` (registered as a LoopListener), `src/agent/loop.ts`
 * (fireBeforeToolCallHooks calls into this).
 */
import type { LoopListener, BeforeToolCallResult } from "./hooks.js";

/** A single permission rule */
export interface PermissionRule {
  /** Tool name to match ("*" matches all) */
  tool?: string;
  /** Glob pattern against the command string (for bash) */
  content?: string;
  /** Glob pattern against the path argument (for file tools) */
  path?: string;
  /** What to do when matched */
  behavior: "allow" | "deny" | "ask";
}

/** Decision returned from a permission check */
export interface PermissionDecision {
  behavior: "allow" | "deny" | "ask";
  reason: string;
}

// TODO configurable
const DEFAULT_RULES: PermissionRule[] = [
  { tool: "bash", content: "sudo *", behavior: "deny" },
  { tool: "bash", content: "rm -rf /", behavior: "deny" },
  { tool: "bash", content: "rm -rf /*", behavior: "deny" },
  { tool: "bash", content: "dd *", behavior: "deny" },
  { tool: "bash", content: ":(){ :|:& };:", behavior: "deny" },
  { tool: "bash", content: "chmod -R 0 /*", behavior: "deny" },
  { tool: "bash", content: "> *", behavior: "deny" },
  { tool: "bash", content: "mkfs*", behavior: "deny" },
  { tool: "bash", content: "shutdown *", behavior: "deny" },
  { tool: "bash", content: "reboot", behavior: "deny" },
  { tool: "bash", content: "halt", behavior: "deny" },
  { tool: "bash", content: "poweroff", behavior: "deny" },
  { tool: "bash", content: "iptables *", behavior: "deny" },
  { tool: "bash", content: "ufw *", behavior: "deny" },
  { tool: "bash", content: "passwd *", behavior: "deny" },
  { tool: "bash", content: "useradd *", behavior: "deny" },
  { tool: "bash", content: "userdel *", behavior: "deny" },
  { tool: "bash", content: "usermod *", behavior: "deny" },
  { tool: "bash", content: "groupadd *", behavior: "deny" },
  { tool: "bash", content: "groupdel *", behavior: "deny" },
  { tool: "bash", content: "wget *", behavior: "ask" },
  { tool: "bash", content: "curl *", behavior: "ask" },
  { tool: "bash", content: "ssh *", behavior: "ask" },
  { tool: "bash", content: "scp *", behavior: "ask" },
  { tool: "write", path: "/etc/*", behavior: "deny" },
  { tool: "bash", content: "kill *", behavior: "ask" },
];

export class PermissionManager implements LoopListener {
  private rules: PermissionRule[];

  constructor(rules?: PermissionRule[]) {
    this.rules = rules ?? [...DEFAULT_RULES];
  }

  /** Add or prepend a rule at runtime */
  addRule(rule: PermissionRule, prepend = false): void {
    if (prepend) {
      this.rules.unshift(rule);
    } else {
      this.rules.push(rule);
    }
  }

  /** Replace all rules */
  setRules(rules: PermissionRule[]): void {
    this.rules = [...rules];
  }

  /** Get a copy of current rules */
  getRules(): PermissionRule[] {
    return [...this.rules];
  }

  /**
   * Check a tool call against all rules. First match wins.
   * Returns the matched rule's behavior + reason.
   */
  check(toolName: string, args: Record<string, unknown>): PermissionDecision {
    for (const rule of this.rules) {
      if (this.matches(rule, toolName, args)) {
        return { behavior: rule.behavior, reason: `Matched rule: ${JSON.stringify(rule)}` };
      }
    }
    return { behavior: "allow", reason: "No matching rule" };
  }

  /** LoopListener hook — returns a veto or handles ask, null means allow. */
  async onBeforeToolCall(toolName: string, args: Record<string, unknown>): Promise<BeforeToolCallResult | null> {
    const decision = this.check(toolName, args);
    if (decision.behavior === "deny") {
      return { allowed: false, reason: decision.reason };
    }
    if (decision.behavior === "ask") {
      const approved = await this.askUser(toolName, args, decision.reason);
      if (!approved) {
        return { allowed: false, reason: `User denied tool "${toolName}"` };
      }
    }
    return null;
  }

  /**
   * Prompt the user for interactive approval.
   * Returns true if approved, false if denied.
   */
  private async askUser(toolName: string, args: Record<string, unknown>, reason: string): Promise<boolean> {
    const preview = JSON.stringify(args).substring(0, 200);
    console.log(`\n  🔒 Permission: "${toolName}" needs your approval`);
    console.log(`     Reason: ${reason}`);
    console.log(`     Args: ${preview}`);
    const { createInterface } = await import("node:readline");
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => {
      rl.question("  Allow? (y/N): ", (answer) => {
        rl.close();
        resolve(answer.trim().toLowerCase() === "y");
      });
    });
  }

  /**
   * Check if a rule matches a given tool call.
   */
  private matches(rule: PermissionRule, toolName: string, args: Record<string, unknown>): boolean {
    if (rule.tool && rule.tool !== "*" && rule.tool !== toolName) return false;
    if (rule.content) {
      const command = (args.command as string) ?? "";
      if (!this.globMatch(command, rule.content)) return false;
    }
    if (rule.path) {
      const path = (args.path as string) ?? "";
      if (!this.globMatch(path, rule.path)) return false;
    }
    return true;
  }

  /**
   * Simple glob matching (supports * and ?).
   */
  private globMatch(value: string, pattern: string): boolean {
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    const regexStr = "^" + escaped.replace(/\*/g, ".*").replace(/\?/g, ".") + "$";
    return new RegExp(regexStr, "u").test(value);
  }
}

/** Singleton instance used by the agent loop */
export const permissionManager = new PermissionManager();
