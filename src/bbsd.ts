import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { DEFAULT_DB_PATH, DEFAULT_SOCKET_PATH, resolvePath } from "./config";
import { BbsDb } from "./db";
import { encodeJsonLine, safeJsonParse, splitJsonLines } from "./ipc/jsonl";
import type { IpcError, IpcRequest, IpcResponse } from "./ipc/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function getArgValue(argv: string[], name: string): string | null {
  const idx = argv.indexOf(name);
  if (idx < 0) return null;
  return argv[idx + 1] ?? null;
}

function parseArgs(argv: string[]) {
  const help = argv.includes("--help") || argv.includes("-h");
  const socket = getArgValue(argv, "--socket");
  const db = getArgValue(argv, "--db");
  return { help, socket, db };
}

function send(socket: net.Socket, res: IpcResponse) {
  socket.write(encodeJsonLine(res));
}

function errorResponse(id: number | null, error: IpcError): IpcResponse {
  return { id, ok: false, error };
}

function badRequest(id: number | null, message: string): IpcResponse {
  return errorResponse(id, { code: "BAD_REQUEST", message });
}

function notFound(id: number, message: string): IpcResponse {
  return errorResponse(id, { code: "NOT_FOUND", message });
}

function internal(id: number | null, message: string): IpcResponse {
  return errorResponse(id, { code: "INTERNAL", message });
}

function parseRequest(value: unknown): { ok: true; req: IpcRequest } | { ok: false; id: number | null; message: string } {
  if (!isRecord(value)) return { ok: false, id: null, message: "Request must be an object" };

  const id = value.id;
  if (!isFiniteNumber(id)) return { ok: false, id: null, message: "Missing numeric 'id'" };

  const type = value.type;
  if (typeof type !== "string") return { ok: false, id, message: "Missing string 'type'" };

  const payload = value.payload;
  if (!isRecord(payload)) return { ok: false, id, message: "Missing object 'payload'" };

  if (type === "listBoards") return { ok: true, req: { id, type, payload: {} } };

  if (type === "listPosts") {
    const boardId = payload.boardId;
    const page = payload.page;
    const pageSize = payload.pageSize;
    if (!isFiniteNumber(boardId) || boardId < 1) return { ok: false, id, message: "payload.boardId must be a positive number" };
    if (!isFiniteNumber(page) || page < 1) return { ok: false, id, message: "payload.page must be >= 1" };
    if (!isFiniteNumber(pageSize) || pageSize < 1 || pageSize > 100)
      return { ok: false, id, message: "payload.pageSize must be 1..100" };
    return { ok: true, req: { id, type, payload: { boardId, page, pageSize } } };
  }

  if (type === "getPost") {
    const postId = payload.postId;
    if (!isFiniteNumber(postId) || postId < 1) return { ok: false, id, message: "payload.postId must be a positive number" };
    return { ok: true, req: { id, type, payload: { postId } } };
  }

  if (type === "createPost") {
    const boardId = payload.boardId;
    const title = payload.title;
    const body = payload.body;
    const author = payload.author;

    if (!isFiniteNumber(boardId) || boardId < 1) return { ok: false, id, message: "payload.boardId must be a positive number" };
    if (typeof title !== "string" || title.trim().length === 0) return { ok: false, id, message: "payload.title must be a non-empty string" };
    if (typeof body !== "string" || body.trim().length === 0) return { ok: false, id, message: "payload.body must be a non-empty string" };
    if (typeof author !== "string" || author.trim().length === 0) return { ok: false, id, message: "payload.author must be a non-empty string" };

    return { ok: true, req: { id, type, payload: { boardId, title, body, author } } };
  }

  return { ok: false, id, message: `Unknown request type: ${type}` };
}

function printHelp() {
  console.log(`Usage: tsx src/bbsd.ts [--socket <path>] [--db <path>]

Env:
  BBS_SOCKET_PATH   Unix socket path (overridden by --socket)
  BBS_DB_PATH       SQLite db path (overridden by --db)
`);
}

function main() {
  const { help, socket, db } = parseArgs(process.argv.slice(2));
  if (help) {
    printHelp();
    process.exit(0);
  }

  const socketPath = resolvePath(socket ?? process.env.BBS_SOCKET_PATH ?? DEFAULT_SOCKET_PATH);
  const dbPath = resolvePath(db ?? process.env.BBS_DB_PATH ?? DEFAULT_DB_PATH);

  fs.mkdirSync(path.dirname(socketPath), { recursive: true });
  try {
    const stat = fs.lstatSync(socketPath);
    if (stat.isSocket()) fs.unlinkSync(socketPath);
    else throw new Error(`${socketPath} exists and is not a socket`);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") throw error;
  }

  const bbsDb = new BbsDb(dbPath);

  const cleanupSocketFile = () => {
    try {
      const stat = fs.lstatSync(socketPath);
      if (stat.isSocket()) fs.unlinkSync(socketPath);
    } catch {
      // ignore
    }
  };

  const server = net.createServer((socketConn) => {
    socketConn.setEncoding("utf8");

    let buffer = "";
    socketConn.on("data", (chunk) => {
      buffer += chunk;
      const { lines, rest } = splitJsonLines(buffer);
      buffer = rest;

      for (const line of lines) {
        const trimmedLine = line.trimEnd();
        if (trimmedLine.trim().length === 0) continue;

        const parsed = safeJsonParse(trimmedLine);
        if (!parsed.ok) {
          send(socketConn, errorResponse(null, { code: "BAD_JSON", message: parsed.error.message }));
          continue;
        }

        const reqParsed = parseRequest(parsed.value);
        if (!reqParsed.ok) {
          send(socketConn, badRequest(reqParsed.id, reqParsed.message));
          continue;
        }

        try {
          const req = reqParsed.req;
          if (req.type === "listBoards") {
            send(socketConn, { id: req.id, ok: true, payload: { boards: bbsDb.listBoards() } });
            continue;
          }

          if (req.type === "listPosts") {
            const board = bbsDb.getBoard(req.payload.boardId);
            if (!board) {
              send(socketConn, notFound(req.id, `Board not found: ${req.payload.boardId}`));
              continue;
            }
            const posts = bbsDb.listPosts(req.payload.boardId, req.payload.page, req.payload.pageSize);
            send(socketConn, {
              id: req.id,
              ok: true,
              payload: { posts, page: req.payload.page, pageSize: req.payload.pageSize },
            });
            continue;
          }

          if (req.type === "getPost") {
            const post = bbsDb.getPost(req.payload.postId);
            if (!post) {
              send(socketConn, notFound(req.id, `Post not found: ${req.payload.postId}`));
              continue;
            }
            send(socketConn, { id: req.id, ok: true, payload: { post } });
            continue;
          }

          if (req.type === "createPost") {
            const board = bbsDb.getBoard(req.payload.boardId);
            if (!board) {
              send(socketConn, notFound(req.id, `Board not found: ${req.payload.boardId}`));
              continue;
            }
            const postId = bbsDb.createPost(req.payload);
            send(socketConn, { id: req.id, ok: true, payload: { postId } });
            continue;
          }

          send(socketConn, badRequest(req.id, `Unhandled request type: ${(req as IpcRequest).type}`));
        } catch (error) {
          send(socketConn, internal(reqParsed.req.id, (error as Error).message));
        }
      }
    });
  });

  server.on("error", (error) => {
    console.error("bbsd server error:", error);
    bbsDb.close();
    cleanupSocketFile();
    process.exit(1);
  });

  server.listen(socketPath, () => {
    console.log(`bbsd listening on ${socketPath}`);
    console.log(`sqlite db: ${dbPath}`);
  });

  process.on("SIGINT", () => {
    server.close(() => {
      bbsDb.close();
      cleanupSocketFile();
      process.exit(0);
    });
  });

  process.on("SIGTERM", () => {
    server.close(() => {
      bbsDb.close();
      cleanupSocketFile();
      process.exit(0);
    });
  });
}

main();
