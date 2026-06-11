/**
 * Configuration loader — reads `codecode.yml` from the current working directory
 * (or `{CODEDIR}/codecode.yml` as fallback) and returns the parsed config.
 *
 * Exports:
 * - `loadConfig()` — loads and parses the YAML config, returns normalized
 *   `CodeCodeConfig` or `null` if no config file exists
 * - `CodeCodeConfig` — the top-level config type
 * - `ConfigProvider` — a single provider entry from the YAML
 *
 * The config file is optional. If it doesn't exist, CodeCode runs with
 * built-in providers only (backward compatible).
 *
 * Used by: `src/llm/providers.ts` to merge YAML-defined providers
 */
import { existsSync, readFileSync } from "fs";
import { load as parseYaml } from "js-yaml";
import { resolve } from "path";
import { cwd } from "process";
import type { ApiFramework } from "../types/index.js";
import { CODEDIR } from "../utils/constants.js";

/** A single provider entry in the YAML config */
export interface ConfigProvider {
  endpoint: string;
  defaultModel: string;
  envKey: string;
  apiFramework: ApiFramework;
  temperature?: number;
  contextWindow?: number;
}

/** Top-level codecode.yml shape */
export interface CodeCodeConfig {
  providers?: Record<string, ConfigProvider>;
}

/** Possible config file locations, in priority order */
const CONFIG_PATHS = [
  resolve(cwd(), "codecode.yml"),
  resolve(cwd(), "codecode.yaml"),
  resolve(CODEDIR, "codecode.yml"),
  resolve(CODEDIR, "codecode.yaml"),
];

/**
 * Load and parse `codecode.yml`. Returns null if no config file exists.
 */
export function loadConfig(): CodeCodeConfig | null {
  for (const path of CONFIG_PATHS) {
    if (existsSync(path)) {
      try {
        const raw = readFileSync(path, "utf-8");
        const parsed = parseYaml(raw) as CodeCodeConfig | null;
        return parsed ?? null;
      } catch (err) {
        console.warn(`  ⚠️  Failed to parse config at ${path}:`, err);
        return null;
      }
    }
  }
  return null;
}