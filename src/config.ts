import path from "node:path";

export const DEFAULT_VAR_DIR = path.resolve(process.cwd(), "var");
export const DEFAULT_SOCKET_PATH = path.join(DEFAULT_VAR_DIR, "bbsd.sock");
export const DEFAULT_DB_PATH = path.join(DEFAULT_VAR_DIR, "bbsd.sqlite3");

export function resolvePath(value: string): string {
  return path.isAbsolute(value) ? value : path.resolve(process.cwd(), value);
}

