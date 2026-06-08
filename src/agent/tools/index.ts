/**
 * Barrel — registers all built-in tools with the singleton ToolRegistry
 * at import time. Re-exports every tool class for external consumers.
 *
 * Exports:
 * - CalculateTool, BashTool, ReadTool, WriteTool, EditTool
 * - LoadSkillTool, TodoTool
 *
 * Side-effect: instantiates and registers each tool with toolRegistry
 * on module load.
 */
import { toolRegistry } from "./tool-registry.js";
import { CalculateTool } from "./calculate.js";
import { BashTool } from "./bash.js";
import { ReadTool } from "./read.js";
import { WriteTool } from "./write.js";
import { EditTool } from "./edit.js";
import { LoadSkillTool } from "./skill/load-skill.js";
import { TodoTool } from "./todo/todo-tool.js";
import { SaveMemoryTool } from "./memory/save-memory-tool.js";

export { CalculateTool } from "./calculate.js";
export { BashTool } from "./bash.js";
export { ReadTool } from "./read.js";
export { WriteTool } from "./write.js";
export { EditTool } from "./edit.js";
export { LoadSkillTool } from "./skill/load-skill.js";
export { TodoTool } from "./todo/todo-tool.js";
export { SaveMemoryTool } from "./memory/save-memory-tool.js";

const builtinTools = [
  new CalculateTool(),
  new BashTool(),
  new ReadTool(),
  new WriteTool(),
  new EditTool(),
  new LoadSkillTool(),
  new TodoTool(),
  new SaveMemoryTool(),
];

for (const tool of builtinTools) {
  toolRegistry.registerFrom(tool);
}