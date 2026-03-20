import assert from "node:assert/strict";
import test from "node:test";
import { createBbsDb } from "./db";

test("createBbsDb does not touch schema during runtime construction", async () => {
  const fakePool = {
    connect: async () => {
      throw new Error("runtime construction must not connect");
    },
    query: async () => {
      throw new Error("runtime construction must not query");
    },
    end: async () => undefined,
  };

  const db = await createBbsDb(
    {
      dsql: {
        host: "example",
        user: "admin",
        database: "postgres",
        region: "ap-northeast-2",
        schema: "public",
        maxConnections: 1,
      },
    },
    fakePool as never,
  );

  assert.equal(db.getPool(), fakePool);
  assert.equal(db.getSchemaName(), "public");

  await db.close();
});
