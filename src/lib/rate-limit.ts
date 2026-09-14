// Best-effort in-memory rate limiter.
//
// Serverless functions on Vercel don't guarantee a single warm instance, so
// this only throttles a given key within whichever instance happens to
// handle its requests — it's a real deterrent against a casual script
// hammering the endpoint from one machine, not a distributed guarantee.
// For that, point this at a shared store (Vercel KV / Upstash Redis) later.

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 5;

const hits = new Map<string, number[]>();

export function isRateLimited(
  key: string,
  maxRequests = MAX_REQUESTS_PER_WINDOW,
  windowMs = WINDOW_MS
): boolean {
  const now = Date.now();
  const timestamps = (hits.get(key) ?? []).filter((t) => now - t < windowMs);

  if (timestamps.length >= maxRequests) {
    hits.set(key, timestamps);
    return true;
  }

  timestamps.push(now);
  hits.set(key, timestamps);

  // Keep the map from growing unbounded over the life of a warm instance.
  if (hits.size > 5000) {
    for (const [k, v] of hits) {
      if (v.every((t) => now - t > windowMs)) hits.delete(k);
    }
  }

  return false;
}
