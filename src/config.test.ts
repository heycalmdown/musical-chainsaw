import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_CONFIG_PREFIX,
  DEFAULT_DSQL_DATABASE,
  DEFAULT_DSQL_REGION,
  DEFAULT_DSQL_SCHEMA,
  DEFAULT_DSQL_USER,
  resolveDbConfigFromEnv,
  resolveConfigPrefixFromEnv,
} from "./config";

function withEnv(
  values: Record<string, string | undefined>,
  run: () => Promise<void> | void,
): Promise<void> | void {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    if (typeof value === "undefined") {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  const restore = () => {
    for (const [key, value] of previous.entries()) {
      if (typeof value === "undefined") {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };

  try {
    const result = run();
    if (result instanceof Promise) {
      return result.finally(restore);
    }
    restore();
  } catch (error) {
    restore();
    throw error;
  }
}

test("resolveDbConfigFromEnv returns null without explicit host", () =>
  withEnv(
    {
      BBS_DSQL_HOST: undefined,
      BBS_CONFIG_PREFIX: undefined,
      BBS_DSQL_USER: undefined,
      BBS_DSQL_DATABASE: undefined,
      BBS_DSQL_SCHEMA: undefined,
      BBS_DSQL_REGION: undefined,
    },
    () => {
      assert.equal(resolveDbConfigFromEnv(), null);
    },
  ));

test("resolveConfigPrefixFromEnv uses the default config prefix when env is absent", () =>
  withEnv(
    {
      BBS_CONFIG_PREFIX: undefined,
    },
    () => {
      assert.equal(resolveConfigPrefixFromEnv(), DEFAULT_CONFIG_PREFIX);
    },
  ));

test("resolveConfigPrefixFromEnv trims trailing slash from explicit prefix", () =>
  withEnv(
    {
      BBS_CONFIG_PREFIX: "/chol/prod/bbs/",
    },
    () => {
      assert.equal(resolveConfigPrefixFromEnv(), DEFAULT_CONFIG_PREFIX);
    },
  ));

test("env defaults remain unchanged when explicit host is provided", () =>
  withEnv(
    {
      BBS_DSQL_HOST: "example-host",
      BBS_DSQL_USER: undefined,
      BBS_DSQL_DATABASE: undefined,
      BBS_DSQL_SCHEMA: undefined,
      BBS_DSQL_REGION: undefined,
      BBS_CONFIG_PREFIX: undefined,
    },
    () => {
      const config = resolveDbConfigFromEnv();
      assert.ok(config);
      assert.equal(config.dsql.host, "example-host");
      assert.equal(config.dsql.user, DEFAULT_DSQL_USER);
      assert.equal(config.dsql.database, DEFAULT_DSQL_DATABASE);
      assert.equal(config.dsql.schema, DEFAULT_DSQL_SCHEMA);
      assert.equal(config.dsql.region, DEFAULT_DSQL_REGION);
    },
  ));
