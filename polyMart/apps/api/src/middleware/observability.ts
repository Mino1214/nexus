import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { observeHttpRequest } from "../services/metrics.js";

const IGNORED_ROUTE_LABELS = new Set(["/metrics"]);

function getRouteLabel(req: Request) {
  const routePath = typeof req.route?.path === "string" ? req.route.path : null;
  const baseUrl = req.baseUrl ?? "";

  if (routePath) {
    return `${baseUrl}${routePath}` || req.path;
  }

  if (req.path === "/health" || req.path === "/ready" || req.path === "/metrics") {
    return req.path;
  }

  return req.originalUrl.split("?")[0] || req.path;
}

function logRequest(payload: Record<string, unknown>) {
  console.log(
    JSON.stringify({
      level: "info",
      ts: new Date().toISOString(),
      event: "http_request",
      ...payload,
    }),
  );
}

export function observabilityMiddleware(req: Request, res: Response, next: NextFunction) {
  const requestId = req.get("x-request-id") || randomUUID();
  const startedAt = process.hrtime.bigint();

  req.requestId = requestId;
  res.setHeader("x-request-id", requestId);

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const route = getRouteLabel(req);

    if (!IGNORED_ROUTE_LABELS.has(route)) {
      observeHttpRequest(req.method, route, res.statusCode, durationMs / 1000);
    }

    logRequest({
      requestId,
      method: req.method,
      path: req.originalUrl,
      route,
      statusCode: res.statusCode,
      durationMs: Number(durationMs.toFixed(2)),
      ip: req.ip,
      userAgent: req.get("user-agent") ?? "",
      userId: req.authUser?.id ?? null,
    });
  });

  next();
}
