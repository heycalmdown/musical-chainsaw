import assert from "node:assert/strict";
import test from "node:test";
import { createAppContext } from "./app-context";

test("app context assembles db and session store from injected runtime deps", async () => {
  const fakePool = {
    end: async () => undefined,
  };
  const fakeDb = {
    close: async () => undefined,
    getPool: () => fakePool,
    getSchemaName: () => "public",
  };

  let createDbCalls = 0;

  const appContext = await createAppContext({
    resolveDbConfig: async () => ({
      dsql: {
        host: "example",
        user: "admin",
        database: "postgres",
        region: "ap-northeast-2",
        schema: "public",
        maxConnections: 1,
      },
    }),
    createDb: async () => {
      createDbCalls += 1;
      return fakeDb as never;
    },
    resolveSessionTtlMs: () => 1234,
  });

  assert.equal(createDbCalls, 1);
  assert.equal(appContext.db, fakeDb);
  assert.equal(appContext.sessionTtlMs, 1234);
  assert.equal(typeof appContext.sessionStore.get, "function");

  await appContext.db.close();
});
