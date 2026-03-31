import { createServer } from "node:http";
import "./lib/loadEnv.js";
import { createApp } from "./app.js";
import { closeDatabase, getPersistenceMode, initDatabase } from "./db/index.js";
import { requestSettlementSweep, startSettlementJobs, stopSettlementJobs } from "./jobs/settlement.js";
import { assertEnvironment, getAdminAuthMode, getHost, getPort, hasSafeJwtSecret } from "./lib/env.js";
import { closeCache } from "./services/cache.js";

async function main() {
  assertEnvironment();
  const host = getHost();
  const port = getPort();
  await initDatabase();
  await startSettlementJobs();
  const app = createApp();
  const server = createServer(app);

  server.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE") {
      console.error(`POLYWATCH API port ${port} is already in use. Stop the existing process or change PORT in apps/api/.env.`);
      process.exit(1);
    }

    console.error(error);
    process.exit(1);
  });

  server.listen(port, host, () => {
    console.log(
      `POLYWATCH API listening on http://${host}:${port} using ${getPersistenceMode()} (admin=${getAdminAuthMode()}, jwt=${hasSafeJwtSecret() ? "custom" : "dev"})`,
    );
  });

  void requestSettlementSweep({ reason: "startup" });

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    server.close();
    await stopSettlementJobs();
    await closeCache();
    await closeDatabase();
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown();
  });
  process.on("SIGTERM", () => {
    void shutdown();
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
