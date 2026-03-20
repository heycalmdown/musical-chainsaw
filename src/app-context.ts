import {
  resolveDbConfig,
  resolveSessionTtlMsFromEnv,
  type DbConfig,
} from "./config";
import { createBbsDb, type BbsDb } from "./db";
import { DsqlSessionStore, type SessionStore } from "./session-store";

export type AppContext = {
  db: BbsDb;
  sessionStore: SessionStore;
  sessionTtlMs: number;
};

export type AppContextDeps = {
  resolveDbConfig: () => Promise<DbConfig>;
  createDb: (config: DbConfig) => Promise<BbsDb>;
  resolveSessionTtlMs: () => number;
};

let appContextPromise: Promise<AppContext> | null = null;

const DEFAULT_APP_CONTEXT_DEPS: AppContextDeps = {
  resolveDbConfig,
  createDb: createBbsDb,
  resolveSessionTtlMs: resolveSessionTtlMsFromEnv,
};

export async function createAppContext(
  deps: AppContextDeps = DEFAULT_APP_CONTEXT_DEPS,
): Promise<AppContext> {
  const dbConfig = await deps.resolveDbConfig();
  const db = await deps.createDb(dbConfig);
  return {
    db,
    sessionStore: new DsqlSessionStore(db.getPool(), db.getSchemaName()),
    sessionTtlMs: deps.resolveSessionTtlMs(),
  };
}

export function getAppContext(): Promise<AppContext> {
  if (!appContextPromise) {
    appContextPromise = createAppContext().catch((error) => {
      appContextPromise = null;
      throw error;
    });
  }

  return appContextPromise;
}

export async function closeAppContext(): Promise<void> {
  if (!appContextPromise) return;

  const current = appContextPromise;
  appContextPromise = null;

  const app = await current;
  await app.db.close();
}
