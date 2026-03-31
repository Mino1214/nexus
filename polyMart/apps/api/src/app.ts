import cors from "cors";
import express from "express";
import betsRouter from "./routes/bets.js";
import downloadRouter from "./routes/download.js";
import adminBusinessRouter from "./routes/adminBusiness.js";
import adminDashboardRouter from "./routes/adminDashboard.js";
import leaderboardRouter from "./routes/leaderboard.js";
import marketsRouter from "./routes/markets.js";
import pricesRouter from "./routes/prices.js";
import settleRouter from "./routes/settle.js";
import translateRouter from "./routes/translate.js";
import usersRouter from "./routes/users.js";
import { getDatabaseHealth, getPersistenceMode } from "./db/index.js";
import { getSettlementQueueMode } from "./jobs/settlement.js";
import { requireAdmin, requireAuth } from "./middleware/auth.js";
import { observabilityMiddleware } from "./middleware/observability.js";
import { rateLimit } from "./middleware/rateLimit.js";
import { getAdminAuthMode, hasExternalAdminSsoConfigured, hasSafeJwtSecret } from "./lib/env.js";
import { HttpError } from "./lib/http.js";
import { getCacheHealth, getCacheMode } from "./services/cache.js";
import { getMetrics, getMetricsContentType } from "./services/metrics.js";

export function createApp() {
  const app = express();
  const webOrigin = process.env.WEB_ORIGIN ?? "http://127.0.0.1:43120";

  app.use(
    cors({
      origin: [
        webOrigin,
        "http://localhost:43120",
        "http://127.0.0.1:43120",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
      ],
      credentials: true,
    }),
  );
  app.use(express.json());
  app.use(observabilityMiddleware);

  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      cache: getCacheMode(),
      queue: getSettlementQueueMode(),
      persistence: getPersistenceMode(),
      translation: process.env.DEEPL_API_KEY ? "deepl+db" : "manual+db",
      adminAuth: getAdminAuthMode(),
      externalAdminSso: hasExternalAdminSsoConfigured() ? "enabled" : "disabled",
      jwt: hasSafeJwtSecret() ? "custom" : "development-placeholder",
      phase: "phase-6-observability",
    });
  });

  app.get("/ready", async (_req, res) => {
    const [database, cache] = await Promise.all([getDatabaseHealth(), getCacheHealth()]);
    const queue = {
      mode: getSettlementQueueMode(),
      ready: getSettlementQueueMode() === "inline" ? true : cache.ready,
      message: getSettlementQueueMode() === "inline" || cache.ready ? undefined : "Queue depends on Redis readiness.",
    };

    const ready = database.ready && cache.ready && queue.ready;

    res.status(ready ? 200 : 503).json({
      status: ready ? "ready" : "degraded",
      timestamp: new Date().toISOString(),
      dependencies: {
        database,
        cache,
        queue,
      },
      security: {
        adminAuth: getAdminAuthMode(),
        jwt: hasSafeJwtSecret() ? "custom" : "development-placeholder",
      },
    });
  });

  app.get("/metrics", async (_req, res, next) => {
    try {
      res.setHeader("Content-Type", getMetricsContentType());
      res.send(await getMetrics());
    } catch (error) {
      next(error);
    }
  });

  app.use("/api", rateLimit());
  app.use("/api/markets", marketsRouter);
  app.use("/api/prices", pricesRouter);
  app.use("/api/leaderboard", leaderboardRouter);
  app.use("/api/translate", translateRouter);
  app.use("/api/bets", betsRouter);
  app.use("/api", usersRouter);
  app.use("/api/settle", settleRouter);
  app.use("/api/admin/dashboard", requireAuth, requireAdmin, adminDashboardRouter);
  app.use("/api/admin/business", requireAuth, requireAdmin, adminBusinessRouter);
  app.use("/api/admin/translations", requireAuth, requireAdmin, translateRouter);
  app.use("/download", downloadRouter);

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const statusCode = err instanceof HttpError ? err.statusCode : 500;
    if (statusCode >= 500) {
      console.error(err);
    } else if (err instanceof Error) {
      console.warn(`${statusCode} ${err.message}`);
    } else {
      console.warn(`${statusCode} Request error`);
    }
    res.status(statusCode).json({
      message: err instanceof Error ? err.message : "Unexpected server error",
    });
  });

  return app;
}
