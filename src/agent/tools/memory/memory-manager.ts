/**
 * Manages persistent memories across sessions. Memories are stored as
 * individual Markdown files with YAML frontmatter under `{CODEDIR}/memory/`,
 * with a compact MEMORY.md index for quick reference.
 *
 * Four memory types: user (preferences), feedback (corrections),
 * project (non-obvious project facts), reference (external resource URLs).
 *
 * Exports:
 * - `MEMORY_TYPES` — the four allowed type strings
 * - `MemoryManager` — class; load/save/index memories
 * - `memoryManager` — singleton, initialized lazily
 *
 * Used by:
 * - `src/agent/prompt.ts` — injects memories into system prompt
 * - `src/agent/tools/memory/save-memory-tool.ts` — tool that writes memories
 */
import { readFileSync, existsSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { join, relative } from "node:path";
import { cwd } from "node:process";
import { CODEDIR } from "../../../utils/constants.js";

export const MEMORY_TYPES = ["user", "feedback", "project", "reference"] as const;
export type MemoryType = (typeof MEMORY_TYPES)[number];

interface MemoryEntry {
  description: string;
  type: MemoryType;
  content: string;
  file: string;
}

const MAX_INDEX_LINES = 200;

export class MemoryManager {
  private memoryDir: string;
  private memories: Record<string, MemoryEntry> = {};
  private loaded = false;

  constructor(memoryDir?: string) {
    this.memoryDir = memoryDir ?? join(CODEDIR, "memory");
  }

  /**
   * Load all memories from disk: scan `*.md` files (excluding MEMORY.md),
   * parse YAML frontmatter, and populate the in-memory store.
   */
  loadAll(): void {
    this.memories = {};
    if (!existsSync(this.memoryDir)) {
      this.loaded = true;
      return;
    }

    const entries = readdirSync(this.memoryDir).sort();
    for (const entry of entries) {
      if (!entry.endsWith(".md") || entry === "MEMORY.md") continue;
      const filePath = join(this.memoryDir, entry);
      const text = readFileSync(filePath, "utf-8");
      const parsed = this.parseFrontmatter(text);
      if (!parsed) continue;

      const name = parsed.name || entry.replace(/\.md$/, "");
      this.memories[name] = {
        description: parsed.description || "",
        type: (parsed.type as MemoryType) || "project",
        content: parsed.content || "",
        file: entry,
      };
    }

    const count = Object.keys(this.memories).length;
    if (count > 0) {
      console.log(`[Memory: ${count} memories loaded from ${this.memoryDir}]`);
    }
    this.loaded = true;
  }

  /**
   * Build a memory section for injection into the system prompt.
   * Returns an empty string when there are no memories.
   */
  loadMemoryPrompt(): string {
    if (!this.loaded || Object.keys(this.memories).length === 0) return "";

    const sections: string[] = [];
    sections.push("# Memories (persistent across sessions)");
    sections.push("");

    for (const memType of MEMORY_TYPES) {
      const typed = Object.entries(this.memories).filter(
        ([_, v]) => v.type === memType,
      );
      if (typed.length === 0) continue;

      sections.push(`## [${memType}]`);
      for (const [name, mem] of typed) {
        sections.push(`### ${name}: ${mem.description}`);
        if (mem.content.trim()) {
          sections.push(mem.content.trim());
        }
        sections.push("");
      }
    }

    return sections.join("\n");
  }

  /**
   * Persist a single memory to disk as a Markdown file with YAML frontmatter,
   * then rebuild the MEMORY.md index. Returns a status message.
   */
  saveMemory(
    name: string,
    description: string,
    memType: string,
    content: string,
  ): string {
    if (!(MEMORY_TYPES as readonly string[]).includes(memType)) {
      return `Error: type must be one of ${MEMORY_TYPES.join(", ")}`;
    }

    const safeName = name.toLowerCase().replace(/[^a-z0-9_-]/g, "_");
    if (!safeName) return "Error: invalid memory name";

    mkdirSync(this.memoryDir, { recursive: true });

    const frontmatter = [
      "---",
      `name: ${name}`,
      `description: ${description}`,
      `type: ${memType}`,
      "---",
      content,
      "",
    ].join("\n");

    const fileName = `${safeName}.md`;
    const filePath = join(this.memoryDir, fileName);
    writeFileSync(filePath, frontmatter, "utf-8");

    this.memories[name] = {
      description,
      type: memType as MemoryType,
      content,
      file: fileName,
    };

    this.rebuildIndex();
    return `Memory "${name}" [${memType}] saved to ${relative(cwd(), filePath)}`;
  }

  /**
   * Rebuild MEMORY.md from current in-memory state, capped at MAX_INDEX_LINES.
   */
  private rebuildIndex(): void {
    const lines: string[] = ["# Memory Index", ""];
    for (const [name, mem] of Object.entries(this.memories)) {
      lines.push(`- ${name}: ${mem.description} [${mem.type}]`);
      if (lines.length >= MAX_INDEX_LINES) {
        lines.push(`... (truncated at ${MAX_INDEX_LINES} lines)`);
        break;
      }
    }

    mkdirSync(this.memoryDir, { recursive: true });
    const indexPath = join(this.memoryDir, "MEMORY.md");
    writeFileSync(indexPath, lines.join("\n") + "\n", "utf-8");
  }

  /**
   * Parse `---` delimited YAML frontmatter + body content.
   * Returns `null` if no frontmatter is found.
   */
  private parseFrontmatter(
    text: string,
  ): { name?: string; description?: string; type?: string; content: string } | null {
    const match = text.match(/^---\s*\n(.*?)\n---\s*\n(.*)$/s);
    if (!match) return null;

    const header = match[1].trim();
    const body = match[2].trim();
    const result: Record<string, string> = { content: body };

    for (const line of header.split("\n")) {
      const idx = line.indexOf(":");
      if (idx === -1) continue;
      result[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }

    return {
      name: result.name,
      description: result.description,
      type: result.type,
      content: result.content,
    };
  }
}

export const memoryManager = new MemoryManager();
