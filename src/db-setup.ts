import { resolveDbConfig } from "./config";
import { setupBbsDb } from "./db";

async function main(): Promise<void> {
  const dbConfig = await resolveDbConfig();
  await setupBbsDb(dbConfig);
  console.log(
    `[db:setup] initialized aurora-dsql:${dbConfig.dsql.host}/${dbConfig.dsql.database} schema=${dbConfig.dsql.schema}`,
  );
}

main().catch((error) => {
  console.error("[db:setup] failed", error);
  process.exitCode = 1;
});
