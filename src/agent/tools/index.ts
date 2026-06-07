import { toolRegistry } from "../tool-registry.js";
import { CalculateTool } from "./calculate.js";
import { BashTool } from "./bash.js";
import { ReadTool } from "./read.js";
import { WriteTool } from "./write.js";
import { EditTool } from "./edit.js";
import { LoadSkillTool } from "./load-skill.js";
import { TodoTool } from "./todo/todo-tool.js";

export { CalculateTool } from "./calculate.js";
export { BashTool } from "./bash.js";
export { ReadTool } from "./read.js";
export { WriteTool } from "./write.js";
export { EditTool } from "./edit.js";
export { LoadSkillTool } from "./load-skill.js";
export { TodoTool } from "./todo/todo-tool.js";

const builtinTools = [
  new CalculateTool(),
  new BashTool(),
  new ReadTool(),
  new WriteTool(),
  new EditTool(),
  new LoadSkillTool(),
  new TodoTool(),
];

for (const tool of builtinTools) {
  toolRegistry.registerFrom(tool);
}