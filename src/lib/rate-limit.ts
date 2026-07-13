// ─── In-memory sliding-window rate limiter (Phase 37 — §12.5) ───────────────
//
// A lightweight, dependency-free limiter suitable for the Next.js middleware
// (Edge) runtime. It keeps per-key request timestamps in a Map and evicts
// entries outside the current window on each check.
//
// LIMITATION: state lives in per-instance memory. On a multi-instance / multi-
// region serverless deployment (e.g. Vercel) each instance keeps its own
// counters, so the effective global limit is approximate. For strict global
// enforcement a shared store (Upstash Redis / @vercel/kv) would be required —
// tracked as a future enhancement.

interface RateLimitResult {
  /** Whether the request is allowed under the limit. */
  allowed: boolean;
  /** Requests remaining in the current window (never negative). */
  remaining: number;
  /** The configured maximum for the window. */
  limit: number;
  /** Seconds until the window frees up (only meaningful when blocked). */
  retryAfter: number;
}

// Map<key, sorted-ascending request timestamps (ms)>
const store = new Map<string, number[]>();

// Periodically drop keys whose timestamps have all expired, to bound memory.
// The interval is unref'd so it never keeps the process alive on its own.
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_TRACKED_WINDOW_MS = 15 * 60 * 1000; // longest window we expect to see

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function ensureCleanupScheduled(): void {
  if (cleanupTimer) return;
  // `setInterval` is available in both the Node and Edge runtimes.
  cleanupTimer = setInterval(() => {
    const cutoff = Date.now() - MAX_TRACKED_WINDOW_MS;
    for (const [key, timestamps] of store) {
      const fresh = timestamps.filter((ts) => ts > cutoff);
      if (fresh.length === 0) {
        store.delete(key);
      } else if (fresh.length !== timestamps.length) {
        store.set(key, fresh);
      }
    }
  }, CLEANUP_INTERVAL_MS);

  // Avoid holding the event loop open when running under Node.
  const timer = cleanupTimer as unknown as { unref?: () => void };
  if (typeof timer.unref === 'function') {
    timer.unref();
  }
}

/**
 * Record a hit for `key` and report whether it is within `limit` requests per
 * `windowMs`. Uses a sliding window: only timestamps inside the window count.
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  ensureCleanupScheduled();

  const now = Date.now();
  const windowStart = now - windowMs;

  const timestamps = (store.get(key) ?? []).filter((ts) => ts > windowStart);

  if (timestamps.length >= limit) {
    const oldest = timestamps[0];
    const retryAfter = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    // Persist the trimmed window so memory stays bounded.
    store.set(key, timestamps);
    return { allowed: false, remaining: 0, limit, retryAfter };
  }

  timestamps.push(now);
  store.set(key, timestamps);

  return {
    allowed: true,
    remaining: Math.max(0, limit - timestamps.length),
    limit,
    retryAfter: 0,
  };
}

/**
 * Best-effort extraction of the originating client IP from proxy headers.
 * Falls back to a constant so the limiter still applies (globally) when no IP
 * can be determined, rather than silently disabling protection.
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    // May be a comma-separated list; the first entry is the original client.
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }

  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp.trim();

  return 'unknown';
}

/** Test-only helper to reset limiter state between runs. */
export function __resetRateLimitStore(): void {
  store.clear();
}
