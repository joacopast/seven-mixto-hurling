import "server-only";

/**
 * Rate limiting. Usa Upstash Redis si está configurado; si no (desarrollo),
 * cae a un limitador en memoria por proceso — suficiente para dev, NO para prod
 * multi-instancia.
 */

interface RateLimitOptions {
  max: number;
  windowSec: number;
}

interface RateLimitResult {
  success: boolean;
  remaining: number;
}

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

const memoryBuckets = new Map<string, { count: number; resetAt: number }>();

async function memoryLimit(key: string, opts: RateLimitOptions): Promise<RateLimitResult> {
  const now = Date.now();
  const bucket = memoryBuckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    memoryBuckets.set(key, { count: 1, resetAt: now + opts.windowSec * 1000 });
    return { success: true, remaining: opts.max - 1 };
  }
  bucket.count++;
  return { success: bucket.count <= opts.max, remaining: Math.max(0, opts.max - bucket.count) };
}

async function upstashLimit(key: string, opts: RateLimitOptions): Promise<RateLimitResult> {
  // Incremento + expiración con pipeline REST de Upstash.
  const res = await fetch(`${url}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify([
      ["INCR", `rl:${key}`],
      ["EXPIRE", `rl:${key}`, String(opts.windowSec), "NX"],
    ]),
    cache: "no-store",
  });
  if (!res.ok) {
    // Ante fallo del limiter, no bloquear la request.
    return { success: true, remaining: opts.max };
  }
  const data = (await res.json()) as Array<{ result: number }>;
  const count = data[0]?.result ?? 0;
  return { success: count <= opts.max, remaining: Math.max(0, opts.max - count) };
}

export async function rateLimit(key: string, opts: RateLimitOptions): Promise<RateLimitResult> {
  if (url && token) return upstashLimit(key, opts);
  return memoryLimit(key, opts);
}
