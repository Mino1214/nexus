import "../lib/loadEnv.js";
import { closeDatabase, findUserByEmail, getDatabaseHealth, initDatabase } from "../db/index.js";
import { getSettlementQueueMode, requestSettlementSweep, startSettlementJobs, stopSettlementJobs } from "../jobs/settlement.js";
import { isAdminUser } from "../services/auth.js";
import { closeCache, getCacheHealth } from "../services/cache.js";
import { assertEnvironment, getAdminAuthMode, hasSafeJwtSecret } from "../lib/env.js";

async function main() {
  assertEnvironment();
  await initDatabase();
  await startSettlementJobs();

  const [database, cache] = await Promise.all([getDatabaseHealth(), getCacheHealth()]);
  const queue = await requestSettlementSweep({
    awaitCompletion: getSettlementQueueMode() === "inline",
    reason: "verify-runtime",
  });
  const demoUser = await findUserByEmail("myno_demo@example.com");

  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    database,
    cache,
    queueMode: getSettlementQueueMode(),
    queue,
    security: {
      adminAuth: getAdminAuthMode(),
      jwt: hasSafeJwtSecret() ? "custom" : "development-placeholder",
    },
    demoUser: demoUser ? {
      email: demoUser.email,
      username: demoUser.username,
      isAdmin: isAdminUser(demoUser),
    } : null,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await stopSettlementJobs();
    await closeCache();
    await closeDatabase();
  });
