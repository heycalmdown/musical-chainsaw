import fs from "node:fs";
import path from "node:path";

export type BbsPaths = {
  socketPath: string;
  dbPath: string;
};

function resolveWorkspacePath(p: string): string {
  return path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
}

export function getBbsPaths(): BbsPaths {
  const socketPath = resolveWorkspacePath(process.env.BBS_SOCKET_PATH ?? "var/bbsd.sock");
  const dbPath = resolveWorkspacePath(process.env.BBS_DB_PATH ?? "var/bbsd.sqlite3");
  return { socketPath, dbPath };
}

export function ensureParentDir(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

