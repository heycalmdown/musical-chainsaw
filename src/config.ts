import path from "node:path";

export const DEFAULT_VAR_DIR = path.resolve(process.cwd(), "var");
export const DEFAULT_DB_PATH = path.join(DEFAULT_VAR_DIR, "bbs.sqlite3");
export const DEFAULT_PORT = 8787;
export const DEFAULT_SESSION_TTL_MS = 30 * 60 * 1000;

export function resolvePath(value: string): string {
  return path.isAbsolute(value) ? value : path.resolve(process.cwd(), value);
}
