import "server-only";

const WINDOW_MS = 60_000;
const DEFAULT_PER_MINUTE = 10;
const MAX_TRACKED_KEYS = 10_000;

/*
 * Fixed one-minute window per key. In-memory: it resets on restart and isn't shared between
 * serverless instances, so it's unreliable until it moves to Postgres. Even so it's the real
 * abuse control for AI routes, because conversation ids are client-generated.
 */
const windows = new Map<string, { start: number; count: number }>();

function perMinute(): number {
  const value = Number(process.env.DESCRIBE_RATE_LIMIT_PER_MIN);
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_PER_MINUTE;
}

/** Counts one request for `key`. False if the key is over its limit for this minute. */
export function allowRequest(key: string, now = Date.now()): boolean {
  const current = windows.get(key);
  if (!current || now - current.start >= WINDOW_MS) {
    windows.delete(key);
    windows.set(key, { start: now, count: 1 });
    if (windows.size > MAX_TRACKED_KEYS) {
      const oldest = windows.keys().next().value;
      if (oldest !== undefined) windows.delete(oldest);
    }
    return true;
  }
  current.count += 1;
  return current.count <= perMinute();
}

export function resetRateLimits(): void {
  windows.clear();
}

/** The client IP from proxy headers. Requests without one share a single bucket. */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || "unknown";
}
