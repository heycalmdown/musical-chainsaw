export const DEFAULT_DDB_TABLE = "Bbs";
export const DEFAULT_DDB_REGION = "ap-northeast-2";
export const DEFAULT_PORT = 8787;
export const DEFAULT_SESSION_TTL_MS = 30 * 60 * 1000;

export type DbConfig = {
  dynamodb: {
    tableName: string;
    region: string;
    endpoint?: string;
  };
};

export function resolveDbConfigFromEnv(): DbConfig {
  const tableName = String(process.env.BBS_DDB_TABLE ?? DEFAULT_DDB_TABLE);
  const region = String(process.env.BBS_DDB_REGION ?? DEFAULT_DDB_REGION);
  const endpointRaw = process.env.BBS_DDB_ENDPOINT;
  const endpoint =
    typeof endpointRaw === "string" && endpointRaw.trim().length > 0
      ? endpointRaw.trim()
      : undefined;

  return {
    dynamodb: {
      tableName,
      region,
      endpoint,
    },
  };
}
