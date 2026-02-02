import http from "node:http";
import crypto from "node:crypto";
import {
  DEFAULT_PORT,
  DEFAULT_SESSION_TTL_MS,
  resolveDbConfigFromEnv,
} from "./config";
import { createBbsDb } from "./db";
import { BbsUiSession } from "./ui/session";
import { ConflictError, DynamoSessionStore } from "./session-store";
import type {
  ApiErrorResponse,
  CreateSessionRequest,
  CreateSessionResponse,
  ScreenModel,
  SessionEventRequest,
  SessionEventResponse,
} from "./protocol";

type TerminalSize = { rows: number; cols: number };

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function normalizeTermSize(input: {
  rows?: unknown;
  cols?: unknown;
}): TerminalSize {
  const rows =
    typeof input.rows === "number" && Number.isFinite(input.rows)
      ? clampInt(input.rows, 10, 200)
      : 24;
  const cols =
    typeof input.cols === "number" && Number.isFinite(input.cols)
      ? clampInt(input.cols, 20, 240)
      : 80;
  return { rows, cols };
}

function sanitizePlainText(value: string): string {
  return value.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\x1b]/g, "");
}

function normalizeNickname(
  value: unknown,
): { ok: true; nickname: string } | { ok: false; message: string } {
  if (typeof value !== "string")
    return { ok: false, message: "nickname must be a string" };
  const cleaned = sanitizePlainText(value).trim();
  if (cleaned.length === 0)
    return { ok: false, message: "nickname must be non-empty" };
  if (cleaned.length > 20)
    return { ok: false, message: "nickname must be <= 20 chars" };
  return { ok: true, nickname: cleaned };
}

function sendJson(
  res: http.ServerResponse,
  status: number,
  body: unknown,
): void {
  const json = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(json);
}

function sendError(
  res: http.ServerResponse,
  status: number,
  code: string,
  message: string,
): void {
  const body: ApiErrorResponse = { error: { code, message } };
  sendJson(res, status, body);
}

async function readJsonBody(
  req: http.IncomingMessage,
  maxBytes: number,
): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;

  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > maxBytes) throw new Error("BODY_TOO_LARGE");
    chunks.push(buf);
  }

  const text = Buffer.concat(chunks).toString("utf8");
  if (text.trim().length === 0) return {};
  return JSON.parse(text) as unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseCreateSessionRequest(
  value: unknown,
): { ok: true; req: CreateSessionRequest } | { ok: false; message: string } {
  if (!isRecord(value)) return { ok: false, message: "Body must be an object" };
  if (typeof value.nickname !== "string")
    return { ok: false, message: "nickname must be a string" };
  if (typeof value.rows !== "undefined" && typeof value.rows !== "number")
    return { ok: false, message: "rows must be a number" };
  if (typeof value.cols !== "undefined" && typeof value.cols !== "number")
    return { ok: false, message: "cols must be a number" };
  return {
    ok: true,
    req: {
      nickname: value.nickname,
      rows: typeof value.rows === "number" ? value.rows : undefined,
      cols: typeof value.cols === "number" ? value.cols : undefined,
    },
  };
}

function parseSessionEventRequest(
  value: unknown,
): { ok: true; req: SessionEventRequest } | { ok: false; message: string } {
  if (!isRecord(value)) return { ok: false, message: "Body must be an object" };
  if (typeof value.input !== "string")
    return { ok: false, message: "input must be a string" };
  const input = sanitizePlainText(value.input);
  if (input.length > 2000)
    return { ok: false, message: "input must be <= 2000 chars" };
  return { ok: true, req: { input } };
}

function shouldExit(screen: ScreenModel): boolean {
  return (
    Array.isArray(screen.actions) &&
    screen.actions.some((a) => a.type === "exit")
  );
}

const MAX_RETRIES = 3;

async function main(): Promise<void> {
  const portRaw = Number(process.env.BBS_PORT ?? DEFAULT_PORT);
  const port = Number.isFinite(portRaw) ? portRaw : DEFAULT_PORT;

  const sessionTtlMsRaw = Number(
    process.env.BBS_SESSION_TTL_MS ?? DEFAULT_SESSION_TTL_MS,
  );
  const sessionTtlMs = Number.isFinite(sessionTtlMsRaw)
    ? sessionTtlMsRaw
    : DEFAULT_SESSION_TTL_MS;

  const dbConfig = resolveDbConfigFromEnv();
  const db = await createBbsDb(dbConfig);

  const sessionStore = new DynamoSessionStore(
    db.getDocumentClient(),
    db.getTableName(),
  );

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      const method = req.method ?? "GET";
      const pathname = url.pathname;

      if (method === "GET" && pathname === "/health") {
        sendJson(res, 200, { ok: true });
        return;
      }

      if (method === "POST" && pathname === "/api/sessions") {
        const bodyRaw = await readJsonBody(req, 64 * 1024);
        const parsed = parseCreateSessionRequest(bodyRaw);
        if (!parsed.ok) {
          sendError(res, 400, "BAD_REQUEST", parsed.message);
          return;
        }

        const nickParsed = normalizeNickname(parsed.req.nickname);
        if (!nickParsed.ok) {
          sendError(res, 400, "BAD_REQUEST", nickParsed.message);
          return;
        }

        const term = normalizeTermSize({
          rows: parsed.req.rows,
          cols: parsed.req.cols,
        });
        const sessionId = crypto.randomUUID();
        const uiSession = new BbsUiSession(db);
        const screen = await uiSession.handleHello({
          user: nickParsed.nickname,
          rows: term.rows,
          cols: term.cols,
        });

        await sessionStore.create({
          sessionId,
          nickname: nickParsed.nickname,
          term,
          state: uiSession.serialize(),
          ttlMs: sessionTtlMs,
        });

        const response: CreateSessionResponse = { sessionId, screen };
        sendJson(res, 200, response);
        return;
      }

      const eventMatch = /^\/api\/sessions\/([^/]+)\/events$/.exec(pathname);
      if (method === "POST" && eventMatch) {
        const sessionId = eventMatch[1]!;

        const bodyRaw = await readJsonBody(req, 128 * 1024);
        const parsed = parseSessionEventRequest(bodyRaw);
        if (!parsed.ok) {
          sendError(res, 400, "BAD_REQUEST", parsed.message);
          return;
        }

        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
          const sessionData = await sessionStore.get(sessionId);
          if (!sessionData) {
            sendError(res, 404, "NOT_FOUND", "Session not found");
            return;
          }

          const uiSession = BbsUiSession.deserialize(db, sessionData.state);
          const screen = await uiSession.handleEvent(parsed.req.input);

          try {
            if (shouldExit(screen)) {
              await sessionStore.delete(sessionId);
            } else {
              await sessionStore.update({
                sessionId,
                state: uiSession.serialize(),
                expectedVersion: sessionData.version,
                ttlMs: sessionTtlMs,
              });
            }

            const response: SessionEventResponse = { screen };
            sendJson(res, 200, response);
            return;
          } catch (error) {
            if (error instanceof ConflictError && attempt < MAX_RETRIES - 1) {
              continue;
            }
            throw error;
          }
        }

        sendError(res, 409, "CONFLICT", "Session update conflict");
        return;
      }

      const sessionMatch = /^\/api\/sessions\/([^/]+)$/.exec(pathname);
      if (sessionMatch) {
        const sessionId = sessionMatch[1]!;
        if (method === "DELETE") {
          const existed = await sessionStore.delete(sessionId);
          sendJson(res, 200, { ok: true, deleted: existed });
          return;
        }
      }

      sendError(res, 404, "NOT_FOUND", "Not found");
    } catch (error) {
      if (error instanceof SyntaxError) {
        sendError(res, 400, "BAD_JSON", "Invalid JSON");
        return;
      }
      if (error instanceof Error && error.message === "BODY_TOO_LARGE") {
        sendError(res, 413, "PAYLOAD_TOO_LARGE", "Body too large");
        return;
      }

      const message = error instanceof Error ? error.message : "Internal error";
      sendError(res, 500, "INTERNAL", message);
    }
  });

  server.listen(port, () => {
    console.log(`[server] http://localhost:${port}`);
    console.log(`[server] db: dynamodb:${dbConfig.dynamodb.tableName}`);
    console.log(`[server] session store: dynamodb`);
  });

  const shutdown = () => {
    server.close(() => {
      void db.close();
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error("[server] failed to start", error);
  process.exitCode = 1;
});
