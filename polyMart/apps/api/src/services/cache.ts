import { Redis } from "ioredis";

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export type CacheMode = "redis" | "memory";

const memoryStore = new Map<string, CacheEntry<unknown>>();

let redisClient: Redis | null = null;

function getRedisUrl() {
  const value = process.env.REDIS_URL?.trim();
  return value ? value : null;
}

function getRedisClient() {
  const redisUrl = getRedisUrl();
  if (!redisUrl) {
    return null;
  }

  if (!redisClient) {
    const client = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
    });
    client.on("error", (error: unknown) => {
      console.error("Redis cache error:", error);
    });
    redisClient = client;
  }

  return redisClient;
}

async function ensureRedisConnected(redis: Redis) {
  if (redis.status === "wait") {
    await redis.connect();
  }
}

export function getCacheMode(): CacheMode {
  return getRedisUrl() ? "redis" : "memory";
}

function getMemoryValue<T>(key: string) {
  const now = Date.now();
  const entry = memoryStore.get(key) as CacheEntry<T> | undefined;
  if (!entry) {
    return null;
  }

  if (entry.expiresAt <= now) {
    memoryStore.delete(key);
    return null;
  }

  return entry.value;
}

function setMemoryValue<T>(key: string, value: T, ttlSeconds: number) {
  memoryStore.set(key, {
    value,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
}

export async function cachedFetch<T>(key: string, ttlSeconds: number, fetcher: () => Promise<T>) {
  const redis = getRedisClient();
  if (redis) {
    try {
      await ensureRedisConnected(redis);
      const cached = await redis.get(key);
      if (cached != null) {
        return JSON.parse(cached) as T;
      }
    } catch {
      const fallback = getMemoryValue<T>(key);
      if (fallback != null) {
        return fallback;
      }
    }
  } else {
    const fallback = getMemoryValue<T>(key);
    if (fallback != null) {
      return fallback;
    }
  }

  const value = await fetcher();

  if (redis) {
    try {
      await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
    } catch {
      setMemoryValue(key, value, ttlSeconds);
    }
  } else {
    setMemoryValue(key, value, ttlSeconds);
  }

  return value;
}

export async function getCacheHealth() {
  const redis = getRedisClient();
  if (!redis) {
    return {
      mode: "memory" as const,
      ready: true,
    };
  }

  try {
    await ensureRedisConnected(redis);
    const pong = await redis.ping();
    return {
      mode: "redis" as const,
      ready: pong === "PONG",
    };
  } catch (error) {
    return {
      mode: "redis" as const,
      ready: false,
      message: error instanceof Error ? error.message : "Redis ping failed.",
    };
  }
}

export function clearExpiredCache() {
  const now = Date.now();
  for (const [key, entry] of memoryStore.entries()) {
    if (entry.expiresAt <= now) {
      memoryStore.delete(key);
    }
  }
}

export async function closeCache() {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}
