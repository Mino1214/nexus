import { Queue, Worker } from "bullmq";
import { settlePendingBets } from "../services/settlement.js";

export type SettlementQueueMode = "bullmq" | "inline";

export interface SettlementJobResult {
  settled: number;
  skipped: boolean;
  queued?: boolean;
  mode: SettlementQueueMode;
}

const QUEUE_NAME = "settlement";
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
const MIN_ENQUEUE_INTERVAL_MS = 5_000;

let settlementQueue: Queue | null = null;
let settlementWorker: Worker | null = null;
let intervalHandle: NodeJS.Timeout | null = null;
let inlineSweep: Promise<SettlementJobResult> | null = null;
let lastEnqueueAt = 0;

function getRedisUrl() {
  const value = process.env.REDIS_URL?.trim();
  return value ? value : null;
}

export function getSettlementQueueMode(): SettlementQueueMode {
  return getRedisUrl() ? "bullmq" : "inline";
}

function getBullConnection() {
  const redisUrl = getRedisUrl();
  if (!redisUrl) {
    return null;
  }

  const parsed = new URL(redisUrl);
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    username: parsed.username || undefined,
    password: parsed.password || undefined,
    db: parsed.pathname && parsed.pathname !== "/" ? Number(parsed.pathname.slice(1)) || 0 : 0,
    tls: parsed.protocol === "rediss:" ? {} : undefined,
  };
}

function getSettlementQueue() {
  const connection = getBullConnection();
  if (!connection) {
    return null;
  }

  if (!settlementQueue) {
    settlementQueue = new Queue(QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    });
  }

  return settlementQueue;
}

async function runInlineSweep() {
  if (!inlineSweep) {
    inlineSweep = settlePendingBets()
      .then((result) => ({
        ...result,
        mode: "inline" as const,
      }))
      .finally(() => {
        inlineSweep = null;
      });
  }

  return inlineSweep;
}

async function enqueueBullSweep(reason: string): Promise<SettlementJobResult> {
  const queue = getSettlementQueue();
  if (!queue) {
    return runInlineSweep();
  }

  const now = Date.now();
  if (now - lastEnqueueAt < MIN_ENQUEUE_INTERVAL_MS) {
    return {
      settled: 0,
      skipped: true,
      queued: true,
      mode: "bullmq",
    };
  }

  try {
    await queue.add("sweep", { reason, requestedAt: new Date(now).toISOString() });
    lastEnqueueAt = now;
    return {
      settled: 0,
      skipped: true,
      queued: true,
      mode: "bullmq",
    };
  } catch (error) {
    console.error("Failed to enqueue settlement job. Falling back to inline execution.", error);
    return runInlineSweep();
  }
}

export async function requestSettlementSweep(options?: {
  awaitCompletion?: boolean;
  reason?: string;
}): Promise<SettlementJobResult> {
  const reason = options?.reason ?? "manual";
  if (options?.awaitCompletion || getSettlementQueueMode() === "inline") {
    return runInlineSweep();
  }

  return enqueueBullSweep(reason);
}

export async function startSettlementJobs() {
  if (getSettlementQueueMode() === "bullmq" && !settlementWorker) {
    const connection = getBullConnection();
    if (connection) {
      settlementWorker = new Worker(
        QUEUE_NAME,
        async () => settlePendingBets(),
        {
          connection,
          concurrency: 1,
        },
      );
      settlementWorker.on("error", (error: unknown) => {
        console.error("Settlement worker error:", error);
      });
    }
  }

  if (!intervalHandle) {
    intervalHandle = setInterval(() => {
      void requestSettlementSweep({ reason: "interval" });
    }, SWEEP_INTERVAL_MS);
  }
}

export async function stopSettlementJobs() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }

  if (settlementWorker) {
    await settlementWorker.close();
    settlementWorker = null;
  }

  if (settlementQueue) {
    await settlementQueue.close();
    settlementQueue = null;
  }
}
