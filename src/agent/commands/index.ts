/**
 * Barrel — registers all built-in slash commands with the command registry.
 * Side-effect import: calling this module triggers registration.
 *
 * Re-exports:
 * - `HelpCommand` — from `./help.ts`
 * - `CompactCommand` — from `./compact.ts`
 * - `ListPermRuleCommand` — from `./list-perm-rule.ts`
 * - `PromptCommand` — from `./prompt.ts`
 *
 * Side effects:
 * - Registers all built-in commands into the singleton `commandRegistry`
 *
 * Used by: `src/cli/repl.ts` via side-effect import
 */
import { commandRegistry } from "./command-registry.js";
import { HelpCommand } from "./help.js";
import { CompactCommand } from "./compact.js";
import { ListPermRuleCommand } from "./list-perm-rule.js";
import { PromptCommand } from "./prompt.js";

export { HelpCommand } from "./help.js";
export { CompactCommand } from "./compact.js";
export { ListPermRuleCommand } from "./list-perm-rule.js";
export { PromptCommand } from "./prompt.js";

const builtinCommands = [
  new HelpCommand(),
  new CompactCommand(),
  new ListPermRuleCommand(),
  new PromptCommand(),
];

for (const cmd of builtinCommands) {
  commandRegistry.register(cmd);
}
