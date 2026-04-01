import {
  createDsqlPool,
  isRetryableDsqlError,
  qualifyName,
  type DsqlPool,
} from "./dsql";
import type { DsqlConfig } from "./config";

export type SerializedSessionState = {
  ctx: {
    user: string;
    rows: number;
    cols: number;
    postsPageSize: number;
  };
  mode: unknown;
  toast: string | undefined;
  rootConferenceId: string | null;
};

export type SessionData = {
  id: string;
  nickname: string;
  term: { rows: number; cols: number };
  state: SerializedSessionState;
  createdAtMs: number;
  lastActiveAtMs: number;
  version: number;
};

export interface SessionStore {
  get(sessionId: string): Promise<SessionData | null>;

  create(args: {
    sessionId: string;
    nickname: string;
    term: { rows: number; cols: number };
    state: SerializedSessionState;
    ttlMs: number;
  }): Promise<SessionData>;

  update(args: {
    sessionId: string;
    term?: { rows: number; cols: number };
    state: SerializedSessionState;
    expectedVersion: number;
    ttlMs: number;
  }): Promise<SessionData>;

  delete(sessionId: string): Promise<boolean>;
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

type SessionRow = {
  session_id: string;
  nickname: string;
  term_rows: number;
  term_cols: number;
  created_at_ms: number | string;
  last_active_at_ms: number | string;
  ctx_json: string;
  mode_json: string;
  toast: string | null;
  root_conference_id: string | null;
  version: number | string;
  expires_at_ms: number | string;
};

export type SessionStoreClientConfig = DsqlConfig;

export function createSessionStoreClient(config: SessionStoreClientConfig): DsqlPool {
  return createDsqlPool(config);
}

function toNumber(value: number | string): number {
  return typeof value === "number" ? value : Number(value);
}

function mapRowToSessionData(row: SessionRow): SessionData {
  return {
    id: row.session_id,
    nickname: row.nickname,
    term: {
      rows: row.term_rows,
      cols: row.term_cols,
    },
    state: {
      ctx: JSON.parse(row.ctx_json),
      mode: JSON.parse(row.mode_json),
      toast: row.toast ?? undefined,
      rootConferenceId: row.root_conference_id,
    },
    createdAtMs: toNumber(row.created_at_ms),
    lastActiveAtMs: toNumber(row.last_active_at_ms),
    version: toNumber(row.version),
  };
}

export class DsqlSessionStore implements SessionStore {
  private readonly sessionsTable: string;

  constructor(
    private readonly pool: DsqlPool,
    schemaName: string,
  ) {
    this.sessionsTable = qualifyName(schemaName, "sessions");
  }

  async get(sessionId: string): Promise<SessionData | null> {
    const result = await this.pool.query<SessionRow>(
      `
        SELECT
          session_id,
          nickname,
          term_rows,
          term_cols,
          created_at_ms,
          last_active_at_ms,
          ctx_json,
          mode_json,
          toast,
          root_conference_id,
          version,
          expires_at_ms
        FROM ${this.sessionsTable}
        WHERE session_id = $1
        LIMIT 1
      `,
      [sessionId],
    );

    const row = result.rows[0];
    if (!row) return null;

    if (toNumber(row.expires_at_ms) <= Date.now()) {
      await this.delete(sessionId);
      return null;
    }

    return mapRowToSessionData(row);
  }

  async create(args: {
    sessionId: string;
    nickname: string;
    term: { rows: number; cols: number };
    state: SerializedSessionState;
    ttlMs: number;
  }): Promise<SessionData> {
    const now = Date.now();
    const expiresAtMs = now + args.ttlMs;

    const result = await this.pool.query<SessionRow>(
      `
        INSERT INTO ${this.sessionsTable} (
          session_id,
          nickname,
          term_rows,
          term_cols,
          created_at_ms,
          last_active_at_ms,
          ctx_json,
          mode_json,
          toast,
          root_conference_id,
          version,
          expires_at_ms
        )
        VALUES ($1, $2, $3, $4, $5, $5, $6, $7, $8, $9, 1, $10)
        RETURNING
          session_id,
          nickname,
          term_rows,
          term_cols,
          created_at_ms,
          last_active_at_ms,
          ctx_json,
          mode_json,
          toast,
          root_conference_id,
          version,
          expires_at_ms
      `,
      [
        args.sessionId,
        args.nickname,
        args.term.rows,
        args.term.cols,
        now,
        JSON.stringify(args.state.ctx),
        JSON.stringify(args.state.mode),
        args.state.toast ?? null,
        args.state.rootConferenceId,
        expiresAtMs,
      ],
    );

    return mapRowToSessionData(result.rows[0]!);
  }

  async update(args: {
    sessionId: string;
    term?: { rows: number; cols: number };
    state: SerializedSessionState;
    expectedVersion: number;
    ttlMs: number;
  }): Promise<SessionData> {
    const now = Date.now();
    const expiresAtMs = now + args.ttlMs;
    const newVersion = args.expectedVersion + 1;

    try {
      const result = await this.pool.query<SessionRow>(
        `
          UPDATE ${this.sessionsTable}
          SET
            term_rows = $3,
            term_cols = $4,
            ctx_json = $5,
            mode_json = $6,
            toast = $7,
            root_conference_id = $8,
            last_active_at_ms = $9,
            version = $10,
            expires_at_ms = $11
          WHERE session_id = $1
            AND version = $2
          RETURNING
            session_id,
            nickname,
            term_rows,
            term_cols,
            created_at_ms,
            last_active_at_ms,
            ctx_json,
            mode_json,
            toast,
            root_conference_id,
            version,
            expires_at_ms
        `,
        [
          args.sessionId,
          args.expectedVersion,
          args.term?.rows ?? args.state.ctx.rows,
          args.term?.cols ?? args.state.ctx.cols,
          JSON.stringify(args.state.ctx),
          JSON.stringify(args.state.mode),
          args.state.toast ?? null,
          args.state.rootConferenceId,
          now,
          newVersion,
          expiresAtMs,
        ],
      );

      const row = result.rows[0];
      if (!row) {
        throw new ConflictError(`Session version conflict for ${args.sessionId}`);
      }

      return mapRowToSessionData(row);
    } catch (error) {
      if (error instanceof ConflictError || isRetryableDsqlError(error)) {
        throw new ConflictError(`Session version conflict for ${args.sessionId}`);
      }
      throw error;
    }
  }

  async delete(sessionId: string): Promise<boolean> {
    const result = await this.pool.query<{ session_id: string }>(
      `
        DELETE FROM ${this.sessionsTable}
        WHERE session_id = $1
        RETURNING session_id
      `,
      [sessionId],
    );

    return (result.rowCount ?? 0) > 0;
  }
}
