import type { NextFunction, Request, Response } from "express";

interface HitCounter {
  count: number;
  resetAt: number;
}

const WINDOW_MS = 60_000;
const LIMIT = 90;
const hits = new Map<string, HitCounter>();

export function rateLimit() {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip ?? "unknown";
    const now = Date.now();
    const existing = hits.get(key);

    if (!existing || existing.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + WINDOW_MS });
      next();
      return;
    }

    if (existing.count >= LIMIT) {
      res.status(429).json({
        message: "Too many requests. Please slow down.",
        retryAfterMs: existing.resetAt - now,
      });
      return;
    }

    existing.count += 1;
    next();
  };
}
