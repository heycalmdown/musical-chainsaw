import crypto from "node:crypto";
import { getAppContext } from "./app-context";
import { BbsUiSession } from "./ui/session";
import { ConflictError } from "./session-store";
import type {
  CreateSessionRequest,
  CreateSessionResponse,
  ScreenModel,
  SessionEventRequest,
  SessionEventResponse,
} from "./protocol";

type TerminalSize = { rows: number; cols: number };

export type DeleteSessionResponse = { ok: boolean; deleted: boolean };

export class ApiRequestError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

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

function normalizeNickname(value: unknown): string {
  if (typeof value !== "string") {
    throw new ApiRequestError(400, "BAD_REQUEST", "nickname must be a string");
  }

  const cleaned = sanitizePlainText(value).trim();
  if (cleaned.length === 0) {
    throw new ApiRequestError(400, "BAD_REQUEST", "nickname must be non-empty");
  }
  if (cleaned.length > 20) {
    throw new ApiRequestError(400, "BAD_REQUEST", "nickname must be <= 20 chars");
  }

  return cleaned;
}

function parseCreateSessionRequest(value: unknown): CreateSessionRequest {
  if (!value || typeof value !== "object") {
    throw new ApiRequestError(400, "BAD_REQUEST", "Body must be an object");
  }

  const body = value as Record<string, unknown>;
  if (typeof body.nickname !== "string") {
    throw new ApiRequestError(400, "BAD_REQUEST", "nickname must be a string");
  }
  if (typeof body.rows !== "undefined" && typeof body.rows !== "number") {
    throw new ApiRequestError(400, "BAD_REQUEST", "rows must be a number");
  }
  if (typeof body.cols !== "undefined" && typeof body.cols !== "number") {
    throw new ApiRequestError(400, "BAD_REQUEST", "cols must be a number");
  }

  return {
    nickname: body.nickname,
    rows: typeof body.rows === "number" ? body.rows : undefined,
    cols: typeof body.cols === "number" ? body.cols : undefined,
  };
}

function parseSessionEventRequest(value: unknown): SessionEventRequest {
  if (!value || typeof value !== "object") {
    throw new ApiRequestError(400, "BAD_REQUEST", "Body must be an object");
  }

  const body = value as Record<string, unknown>;
  if (typeof body.input !== "string") {
    throw new ApiRequestError(400, "BAD_REQUEST", "input must be a string");
  }
  if (typeof body.rows !== "undefined" && typeof body.rows !== "number") {
    throw new ApiRequestError(400, "BAD_REQUEST", "rows must be a number");
  }
  if (typeof body.cols !== "undefined" && typeof body.cols !== "number") {
    throw new ApiRequestError(400, "BAD_REQUEST", "cols must be a number");
  }

  const input = sanitizePlainText(body.input);
  if (input.length > 2000) {
    throw new ApiRequestError(
      400,
      "BAD_REQUEST",
      "input must be <= 2000 chars",
    );
  }

  return {
    input,
    rows: typeof body.rows === "number" ? body.rows : undefined,
    cols: typeof body.cols === "number" ? body.cols : undefined,
  };
}

function requireSessionId(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ApiRequestError(400, "BAD_REQUEST", "sessionId is required");
  }
  return value.trim();
}

function shouldExit(screen: ScreenModel): boolean {
  return (
    Array.isArray(screen.actions) &&
    screen.actions.some((action) => action.type === "exit")
  );
}

export function parseJsonText(
  text: string | null | undefined,
  maxBytes: number,
): unknown {
  const normalized = typeof text === "string" ? text : "";
  if (Buffer.byteLength(normalized, "utf8") > maxBytes) {
    throw new ApiRequestError(413, "PAYLOAD_TOO_LARGE", "Body too large");
  }
  if (normalized.trim().length === 0) return {};

  try {
    return JSON.parse(normalized) as unknown;
  } catch {
    throw new ApiRequestError(400, "BAD_JSON", "Invalid JSON");
  }
}

const MAX_RETRIES = 3;

export async function handleHealthRequest(): Promise<{ ok: true }> {
  return { ok: true };
}

export async function handleCreateSessionRequest(
  body: unknown,
): Promise<CreateSessionResponse> {
  const req = parseCreateSessionRequest(body);
  const nickname = normalizeNickname(req.nickname);
  const term = normalizeTermSize({
    rows: req.rows,
    cols: req.cols,
  });

  const { db, sessionStore, sessionTtlMs } = await getAppContext();
  const sessionId = crypto.randomUUID();
  const uiSession = new BbsUiSession(db);
  const screen = await uiSession.handleHello({
    user: nickname,
    rows: term.rows,
    cols: term.cols,
  });

  await sessionStore.create({
    sessionId,
    nickname,
    term,
    state: uiSession.serialize(),
    ttlMs: sessionTtlMs,
  });

  return { sessionId, screen };
}

export async function handleSessionEventRequest(
  sessionIdRaw: unknown,
  body: unknown,
): Promise<SessionEventResponse> {
  const sessionId = requireSessionId(sessionIdRaw);
  const req = parseSessionEventRequest(body);
  const { db, sessionStore, sessionTtlMs } = await getAppContext();

  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    const sessionData = await sessionStore.get(sessionId);
    if (!sessionData) {
      throw new ApiRequestError(404, "NOT_FOUND", "Session not found");
    }

    const uiSession = BbsUiSession.deserialize(db, sessionData.state);
    const term = normalizeTermSize({
      rows: req.rows ?? sessionData.term.rows,
      cols: req.cols ?? sessionData.term.cols,
    });
    uiSession.setTerminalSize(term);
    const screen = await uiSession.handleEvent(req.input);

    try {
      if (shouldExit(screen)) {
        await sessionStore.delete(sessionId);
      } else {
        await sessionStore.update({
          sessionId,
          term,
          state: uiSession.serialize(),
          expectedVersion: sessionData.version,
          ttlMs: sessionTtlMs,
        });
      }

      return { screen };
    } catch (error) {
      if (error instanceof ConflictError && attempt < MAX_RETRIES - 1) {
        continue;
      }
      throw error;
    }
  }

  throw new ApiRequestError(409, "CONFLICT", "Session update conflict");
}

export async function handleDeleteSessionRequest(
  sessionIdRaw: unknown,
): Promise<DeleteSessionResponse> {
  const sessionId = requireSessionId(sessionIdRaw);
  const { sessionStore } = await getAppContext();
  const deleted = await sessionStore.delete(sessionId);
  return { ok: true, deleted };
}
