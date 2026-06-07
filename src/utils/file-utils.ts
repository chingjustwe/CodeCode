import { resolve } from "path";
import { cwd } from "process";

const WORKDIR = cwd();

export function safePath(p: string): string {
  const path = resolve(WORKDIR, p);
  if (!path.startsWith(WORKDIR)) {
    throw new Error(`Path escapes workspace: ${p}`);
  }
  return path;
}