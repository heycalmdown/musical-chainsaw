import assert from "node:assert/strict";
import test from "node:test";
import { DSQL_SCHEMA_INDEXES, ensureDsqlSchema } from "./dsql";

test("DSQL schema indexes do not specify sort direction", async () => {
  for (const index of DSQL_SCHEMA_INDEXES) {
    assert.equal(/\bASC\b|\bDESC\b/.test(index.definition), false);
  }

  const executedSql: string[] = [];
  const client = {
    async query(sql: string) {
      executedSql.push(sql);
      if (sql.includes("FROM pg_catalog.pg_indexes")) {
        return { rows: [{ exists: false }], rowCount: 1 };
      }
      if (sql.includes("CREATE INDEX ASYNC")) {
        return { rows: [{ job_id: "job-1" }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
    release() {},
  };

  const pool = {
    async connect() {
      return client;
    },
  };

  await ensureDsqlSchema(pool as never, "public");

  const createIndexSql = executedSql.filter((sql) =>
    sql.includes("CREATE INDEX ASYNC"),
  );
  const waitSql = executedSql.filter((sql) => sql.includes("wait_for_job"));

  assert.equal(createIndexSql.length, DSQL_SCHEMA_INDEXES.length);
  for (const sql of createIndexSql) {
    assert.equal(/\bASC\b|\bDESC\b/.test(sql), false);
  }
  assert.deepEqual(
    waitSql,
    DSQL_SCHEMA_INDEXES.map(() => "CALL sys.wait_for_job($1)"),
  );
});
