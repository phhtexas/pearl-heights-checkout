import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import type { Db } from "../db/client";

/**
 * Per-client rate limits (launch gate). One atomic UPSERT per request increments a fixed-window counter keyed by
 * (bucket, salted SHA-256 of the client IP, window start). Raw IPs are never stored or logged.
 *  - Client IP: Vercel's x-real-ip, else the first x-forwarded-for entry (set by Vercel's edge, not trusted beyond that).
 *  - Over the limit -> 429, generic message, Retry-After, no-store. No DB work beyond the counter.
 *  - Database unavailable -> allow (fail open) and log once per request; every money step has its own idempotency
 *    and lease protection, so an outage of this layer cannot cause duplicate charges.
 * Webhooks (Stripe signature) and the cron runner (bearer secret) are not rate limited here.
 */
export interface Limit { bucket: string; max: number; windowS: number }

export const LIMITS = {
  calendar: { bucket: "calendar", max: 120, windowS: 60 },
  quote: { bucket: "quote", max: 30, windowS: 60 },
  checkout: { bucket: "checkout", max: 10, windowS: 600 },
  mockReset: { bucket: "mock_reset", max: 5, windowS: 60 },
  testEmail: { bucket: "test_email", max: 3, windowS: 3600 },
} satisfies Record<string, Limit>;

export function clientHash(req: Request, salt: string): string {
  const ip = req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

export async function checkLimit(db: Db | null, req: Request, limit: Limit, env: NodeJS.ProcessEnv = process.env, nowMs = Date.now()):
  Promise<{ ok: true } | { ok: false; retryAfterS: number }> {
  if (!db) return { ok: true };
  const windowStartMs = Math.floor(nowMs / (limit.windowS * 1000)) * limit.windowS * 1000;
  try {
    const [r] = await db.query<{ count: number }>(
      `INSERT INTO rate_limits (bucket, client_hash, window_start, count) VALUES ($1, $2, $3, 1)
       ON CONFLICT (bucket, client_hash, window_start) DO UPDATE SET count = rate_limits.count + 1
       RETURNING count`, [limit.bucket, clientHash(req, env.RATE_LIMIT_SALT ?? env.CRON_SECRET ?? "pearl-heights"), new Date(windowStartMs).toISOString()]);
    if (Number(r?.count ?? 0) <= limit.max) return { ok: true };
    return { ok: false, retryAfterS: Math.max(1, Math.ceil((windowStartMs + limit.windowS * 1000 - nowMs) / 1000)) };
  } catch {
    console.error("rate limit unavailable; allowing request");
    return { ok: true };
  }
}

export function tooMany(retryAfterS: number) {
  return NextResponse.json({ error: "Too many requests. Please wait a moment and try again." },
    { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": String(retryAfterS) } });
}

/** Maintenance: drop windows older than a day. */
export async function purgeOldRateLimits(db: Db): Promise<number> {
  return (await db.query(`DELETE FROM rate_limits WHERE window_start < now() - interval '1 day' RETURNING 1`)).length;
}
