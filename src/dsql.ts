import { AuroraDSQLPool } from "@aws/aurora-dsql-node-postgres-connector";
import type { PoolClient } from "pg";
import type { DsqlConfig } from "./config";

export type DsqlPool = AuroraDSQLPool;
export type DsqlClient = PoolClient;

const DEFAULT_IDLE_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_LIFETIME_SECONDS = 55 * 60;
const DEFAULT_TRANSACTION_RETRIES = 3;
const DEFAULT_INDEX_RETRIES = 5;

export const DSQL_SCHEMA_INDEXES = [
  {
    tableName: "menu_items",
    indexName: "menu_items_conference_created_idx",
    definition: "(conference_id, created_at, menu_item_id)",
  },
  {
    tableName: "boards",
    indexName: "boards_conference_created_idx",
    definition: "(conference_id, created_at, board_id)",
  },
  {
    tableName: "posts",
    indexName: "posts_board_created_idx",
    definition: "(board_id, conference_id, created_at, post_id)",
  },
] as const;

type PgErrorLike = {
  code?: string;
  message?: string;
};

function asPgError(error: unknown): PgErrorLike | null {
  if (!error || typeof error !== "object") return null;
  return error as PgErrorLike;
}

export function isRetryableDsqlError(error: unknown): boolean {
  const pgError = asPgError(error);
  if (!pgError) return false;

  if (pgError.code === "40001" || pgError.code === "40P01") {
    return true;
  }

  return (
    typeof pgError.message === "string" &&
    pgError.message.includes("schema of this transaction is updated")
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function qualifyName(schemaName: string, objectName: string): string {
  return `${quoteIdentifier(schemaName)}.${quoteIdentifier(objectName)}`;
}

export function createDsqlPool(config: DsqlConfig): DsqlPool {
  return new AuroraDSQLPool({
    host: config.host,
    user: config.user,
    database: config.database,
    region: config.region,
    profile: config.profile,
    max: config.maxConnections,
    idleTimeoutMillis: DEFAULT_IDLE_TIMEOUT_MS,
    maxLifetimeSeconds: DEFAULT_MAX_LIFETIME_SECONDS,
  });
}

async function indexExists(
  client: DsqlClient,
  schemaName: string,
  indexName: string,
): Promise<boolean> {
  const result = await client.query<{ exists: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_indexes
        WHERE schemaname = $1
          AND indexname = $2
      ) AS "exists"
    `,
    [schemaName, indexName],
  );

  return Boolean(result.rows[0]?.exists);
}

async function ensureAsyncIndex(
  client: DsqlClient,
  schemaName: string,
  tableName: string,
  indexName: string,
  definition: string,
): Promise<void> {
  if (await indexExists(client, schemaName, indexName)) return;

  const sql = `CREATE INDEX ASYNC ${quoteIdentifier(indexName)} ON ${qualifyName(schemaName, tableName)} ${definition}`;

  for (let attempt = 0; attempt < DEFAULT_INDEX_RETRIES; attempt += 1) {
    try {
      const result = await client.query<{ job_id?: string }>(sql);
      const jobId = result.rows[0]?.job_id;
      if (jobId) {
        await client.query("CALL sys.wait_for_job($1)", [jobId]);
      }
      return;
    } catch (error) {
      const pgError = asPgError(error);
      if (pgError?.code === "42P07") return;
      if (!isRetryableDsqlError(error) || attempt === DEFAULT_INDEX_RETRIES - 1) {
        throw error;
      }
      await delay(50 * (attempt + 1));
    }
  }
}

export async function ensureDsqlSchema(
  pool: DsqlPool,
  schemaName: string,
): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${qualifyName(schemaName, "conferences")} (
        conference_id TEXT PRIMARY KEY,
        slug TEXT,
        name TEXT NOT NULL,
        is_root BOOLEAN NOT NULL DEFAULT FALSE,
        welcome_title TEXT NOT NULL,
        welcome_body TEXT NOT NULL,
        menu_title TEXT NOT NULL,
        menu_body TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        updated_by TEXT NOT NULL
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS ${qualifyName(schemaName, "menu_items")} (
        menu_item_id TEXT PRIMARY KEY,
        conference_id TEXT NOT NULL,
        label TEXT NOT NULL,
        display_no TEXT NOT NULL,
        display_type TEXT NOT NULL,
        action_type TEXT NOT NULL,
        action_ref TEXT NOT NULL,
        body TEXT NOT NULL,
        hidden BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        updated_by TEXT NOT NULL
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS ${qualifyName(schemaName, "boards")} (
        board_id TEXT PRIMARY KEY,
        conference_id TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS ${qualifyName(schemaName, "posts")} (
        post_id TEXT PRIMARY KEY,
        conference_id TEXT NOT NULL,
        board_id TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        author TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS ${qualifyName(schemaName, "sessions")} (
        session_id TEXT PRIMARY KEY,
        nickname TEXT NOT NULL,
        term_rows INTEGER NOT NULL,
        term_cols INTEGER NOT NULL,
        created_at_ms BIGINT NOT NULL,
        last_active_at_ms BIGINT NOT NULL,
        ctx_json TEXT NOT NULL,
        mode_json TEXT NOT NULL,
        toast TEXT,
        root_conference_id TEXT,
        version INTEGER NOT NULL,
        expires_at_ms BIGINT NOT NULL
      )
    `);

    for (const index of DSQL_SCHEMA_INDEXES) {
      await ensureAsyncIndex(
        client,
        schemaName,
        index.tableName,
        index.indexName,
        index.definition,
      );
    }
  } finally {
    client.release();
  }
}

async function rollbackQuietly(client: DsqlClient): Promise<void> {
  try {
    await client.query("ROLLBACK");
  } catch {
    // Ignore rollback failures on a broken connection.
  }
}

export async function withDsqlTransaction<T>(
  pool: DsqlPool,
  run: (client: DsqlClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; attempt < DEFAULT_TRANSACTION_RETRIES; attempt += 1) {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      const result = await run(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await rollbackQuietly(client);
      if (
        !isRetryableDsqlError(error) ||
        attempt === DEFAULT_TRANSACTION_RETRIES - 1
      ) {
        throw error;
      }
      await delay(25 * (attempt + 1));
    } finally {
      client.release();
    }
  }

  throw new Error("unreachable");
}
