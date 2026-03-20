import { GetParametersCommand, SSMClient } from "@aws-sdk/client-ssm";

export const DEFAULT_DSQL_DATABASE = "postgres";
export const DEFAULT_DSQL_REGION = "ap-northeast-2";
export const DEFAULT_DSQL_SCHEMA = "public";
export const DEFAULT_DSQL_USER = "admin";
export const DEFAULT_DSQL_MAX_CONNECTIONS = 10;
export const DEFAULT_SESSION_TTL_MS = 30 * 60 * 1000;
export const DEFAULT_CONFIG_REGION = DEFAULT_DSQL_REGION;
export const DEFAULT_CONFIG_PREFIX = "/chol/prod/bbs";

export type DsqlConfig = {
  host: string;
  user: string;
  database: string;
  region?: string;
  profile?: string;
  schema: string;
  maxConnections: number;
};

export type DbConfig = {
  dsql: DsqlConfig;
};

function normalizeOptionalEnvString(
  value: string | undefined,
): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function requireEnv(name: string): string {
  const value = normalizeOptionalEnvString(process.env[name]);
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function resolveDsqlRegionFromEnv(): string {
  const explicitRegion = normalizeOptionalEnvString(process.env.BBS_DSQL_REGION);
  if (explicitRegion) return explicitRegion;

  const awsRegion = normalizeOptionalEnvString(process.env.AWS_REGION);
  if (awsRegion) return awsRegion;

  return DEFAULT_DSQL_REGION;
}

function resolveConfigRegionFromEnv(): string {
  const explicitRegion = normalizeOptionalEnvString(process.env.BBS_CONFIG_REGION);
  if (explicitRegion) return explicitRegion;
  return resolveDsqlRegionFromEnv() ?? DEFAULT_CONFIG_REGION;
}

function resolveMaxConnectionsFromEnv(): number {
  const maxConnectionsRaw = Number(
    process.env.BBS_DSQL_MAX_CONNECTIONS ?? DEFAULT_DSQL_MAX_CONNECTIONS,
  );
  return Number.isFinite(maxConnectionsRaw) && maxConnectionsRaw > 0
    ? Math.trunc(maxConnectionsRaw)
    : DEFAULT_DSQL_MAX_CONNECTIONS;
}

function buildDbConfig(values: {
  host: string;
  user: string;
  database: string;
  region: string;
  profile?: string;
  schema: string;
  maxConnections: number;
}): DbConfig {
  return {
    dsql: {
      host: values.host,
      user: values.user,
      database: values.database,
      region: values.region,
      profile: values.profile,
      schema: values.schema,
      maxConnections: values.maxConnections,
    },
  };
}

export function resolveDbConfigFromEnv(): DbConfig | null {
  const host = normalizeOptionalEnvString(process.env.BBS_DSQL_HOST);
  if (!host) return null;

  return buildDbConfig({
    host,
    user: String(process.env.BBS_DSQL_USER ?? DEFAULT_DSQL_USER),
    database: String(process.env.BBS_DSQL_DATABASE ?? DEFAULT_DSQL_DATABASE),
    region: resolveDsqlRegionFromEnv(),
    profile: normalizeOptionalEnvString(process.env.BBS_DSQL_PROFILE),
    schema: String(process.env.BBS_DSQL_SCHEMA ?? DEFAULT_DSQL_SCHEMA),
    maxConnections: resolveMaxConnectionsFromEnv(),
  });
}

export function requireDbConfigFromEnv(): DbConfig {
  const config = resolveDbConfigFromEnv();
  if (!config) {
    throw new Error("BBS_DSQL_HOST is required");
  }
  return config;
}

export function resolveConfigPrefixFromEnv(): string {
  const prefix = normalizeOptionalEnvString(process.env.BBS_CONFIG_PREFIX);
  return (prefix ?? DEFAULT_CONFIG_PREFIX).replace(/\/+$/, "");
}

type DbConfigParameterSet = {
  host: string;
  user?: string;
  database?: string;
  schema?: string;
};

function resolveDsqlParameterNames(prefix: string): Record<keyof DbConfigParameterSet, string> {
  return {
    host: `${prefix}/dsql/host`,
    user: `${prefix}/dsql/user`,
    database: `${prefix}/dsql/database`,
    schema: `${prefix}/dsql/schema`,
  };
}

export async function resolveDbConfigFromSsm(
  prefix: string,
): Promise<DbConfig> {
  const parameterNames = resolveDsqlParameterNames(prefix);
  const client = new SSMClient({ region: resolveConfigRegionFromEnv() });
  const response = await client.send(
    new GetParametersCommand({
      Names: Object.values(parameterNames),
    }),
  );

  const byName = new Map(
    (response.Parameters ?? [])
      .filter((parameter): parameter is { Name: string; Value: string } =>
        typeof parameter.Name === "string" && typeof parameter.Value === "string",
      )
      .map((parameter) => [parameter.Name, parameter.Value]),
  );

  const host = byName.get(parameterNames.host);
  if (!host) {
    throw new Error(`Missing SSM parameter: ${parameterNames.host}`);
  }

  return buildDbConfig({
    host,
    user: byName.get(parameterNames.user) ?? DEFAULT_DSQL_USER,
    database: byName.get(parameterNames.database) ?? DEFAULT_DSQL_DATABASE,
    region: resolveDsqlRegionFromEnv(),
    profile: normalizeOptionalEnvString(process.env.BBS_DSQL_PROFILE),
    schema: byName.get(parameterNames.schema) ?? DEFAULT_DSQL_SCHEMA,
    maxConnections: resolveMaxConnectionsFromEnv(),
  });
}

export async function resolveDbConfig(): Promise<DbConfig> {
  const envConfig = resolveDbConfigFromEnv();
  if (envConfig) return envConfig;

  const prefix = resolveConfigPrefixFromEnv();
  return resolveDbConfigFromSsm(prefix);
}

export function resolveSessionTtlMsFromEnv(): number {
  const ttlRaw = Number(
    process.env.BBS_SESSION_TTL_MS ?? DEFAULT_SESSION_TTL_MS,
  );
  return Number.isFinite(ttlRaw) && ttlRaw > 0
    ? Math.trunc(ttlRaw)
    : DEFAULT_SESSION_TTL_MS;
}
