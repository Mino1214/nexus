import { Counter, Histogram, Registry, collectDefaultMetrics } from "prom-client";

const register = new Registry();

register.setDefaultLabels({
  service: "polywatch-api",
});

collectDefaultMetrics({
  register,
  prefix: "polywatch_api_",
});

const httpRequestsTotal = new Counter({
  name: "polywatch_api_http_requests_total",
  help: "Total number of HTTP requests handled by the API.",
  labelNames: ["method", "route", "status_code"] as const,
  registers: [register],
});

const httpRequestDuration = new Histogram({
  name: "polywatch_api_http_request_duration_seconds",
  help: "Duration of HTTP requests handled by the API.",
  labelNames: ["method", "route", "status_code"] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
  registers: [register],
});

export function observeHttpRequest(method: string, route: string, statusCode: number, durationSeconds: number) {
  const labels = {
    method,
    route,
    status_code: String(statusCode),
  };

  httpRequestsTotal.inc(labels);
  httpRequestDuration.observe(labels, durationSeconds);
}

export async function getMetrics() {
  return register.metrics();
}

export function getMetricsContentType() {
  return register.contentType;
}
