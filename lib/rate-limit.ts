import { createClient } from "redis";

let redisClient: Awaited<ReturnType<typeof createClient>> | null = null;

function envPositiveInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function getClient(): Promise<Awaited<
  ReturnType<typeof createClient>
> | null> {
  const url = process.env.REDIS_URL;
  if (!url) {
    return null;
  }
  if (redisClient) {
    return redisClient;
  }
  try {
    const client = createClient({ url }).on("error", (err: Error) => {
      console.warn("[RateLimit] Redis client error:", err.message);
    });
    await client.connect();
    redisClient = client;
    return client;
  } catch (error) {
    console.warn(
      "[RateLimit] Redis connect failed:",
      error instanceof Error ? error.message : String(error),
    );
    return null;
  }
}

/**
 * Fixed 60s window burst limit for chat POSTs.
 * Returns true when the request is allowed.
 * Disabled when CHAT_BURST_LIMIT_PER_MINUTE is unset/0, or Redis is unavailable
 * (fail-open so self-host without Redis still works).
 */
export async function allowChatBurst(userId: string): Promise<boolean> {
  const limit = envPositiveInt("CHAT_BURST_LIMIT_PER_MINUTE", 0);
  if (limit <= 0) {
    return true;
  }

  const client = await getClient();
  if (!client) {
    return true;
  }

  const key = `ratelimit:chat:burst:${userId}`;
  try {
    const count = await client.incr(key);
    if (count === 1) {
      await client.expire(key, 60);
    }
    return count <= limit;
  } catch (error) {
    console.warn(
      "[RateLimit] burst check failed:",
      error instanceof Error ? error.message : String(error),
    );
    return true;
  }
}
