/**
 * Global constants for CodeCode.
 *
 * Exports:
 * - `CODEDIR` — working/config directory path, defaults to `.codecode`,
 *   customizable via the `CODEDIR` env var. Used by all modules that need
 *   to read/write CodeCode-internal files (skills, transcripts, persisted
 *   tool outputs, etc.).
 *
 * Used by:
 * - `src/agent/compact/index.ts` — tool-result persistence & transcripts
 * - `src/agent/tools/skill/skill-registry.ts` — skill discovery
 */
import { resolve } from "path";
import { cwd } from "process";

export const CODEDIR = resolve(cwd(), process.env.CODEDIR || ".codecode");
