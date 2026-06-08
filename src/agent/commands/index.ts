/**
 * Barrel — registers all built-in slash commands with the command registry.
 * Side-effect import: calling this module triggers registration.
 *
 * Re-exports:
 * - `HelpCommand` — from `./help.ts`
 *
 * Side effects:
 * - Registers `HelpCommand` (and future commands) into the singleton `commandRegistry`
 *
 * Used by: `src/cli/repl.ts` via side-effect import
 */
import { commandRegistry } from "./command-registry.js";
import { HelpCommand } from "./help.js";
import { CompactCommand } from "./compact.js";
import { ListPermRuleCommand } from "./list-perm-rule.js";

export { HelpCommand } from "./help.js";
export { CompactCommand } from "./compact.js";
export { ListPermRuleCommand } from "./list-perm-rule.js";

const builtinCommands = [new HelpCommand(), new CompactCommand(), new ListPermRuleCommand()];

for (const cmd of builtinCommands) {
  commandRegistry.register(cmd);
}
