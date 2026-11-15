import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import type { Db } from "../src/db/client";
import { checkLimit, clientHash, purgeOldRateLimits } from "../src/server/rateLimit";
import { runMigrations } from "../scripts/migrate.mjs";

const wrap = (pg: PGlite): Db => ({
  async query(text, params = []) { return (await pg.query(text, params as any[])).rows as any; },
  async tx(st) { return pg.transaction(async (t) => { const out: any[][] = []; for (const [text, p] of st) out.push((await t.query(text, p as any[])).rows as any[]); return out; }); },
});
const req = (ip: string) => new Request("https://x.test/api/quote", { method: "POST", headers: { "x-real-ip": ip } });
const env = { RATE_LIMIT_SALT: "salt" } as any;
const limit = { bucket: "quote", max: 3, windowS: 60 };

describe("rate limits", () => {
  it("allows up to the limit per client and window, then 429 with Retry-After; other clients unaffected; next window resets", async () => {
    const db = wrap(new PGlite()); await runMigrations(db, undefined, () => {});
    const t0 = Date.UTC(2026, 10, 14, 12, 0, 10);
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await checkLimit(db, req("1.2.3.4"), limit, env, t0));
    expect(results.slice(0, 3).every((r) => r.ok)).toBe(true);
    expect(results[3]).toEqual({ ok: false, retryAfterS: 50 });
    expect((await checkLimit(db, req("5.6.7.8"), limit, env, t0)).ok).toBe(true);
    expect((await checkLimit(db, req("1.2.3.4"), limit, env, t0 + 60_000)).ok).toBe(true);
  });
  it("concurrent requests are counted atomically", async () => {
    const db = wrap(new PGlite()); await runMigrations(db, undefined, () => {});
    const t0 = Date.UTC(2026, 10, 14, 12, 0, 0);
    const r = await Promise.all(Array.from({ length: 10 }, () => checkLimit(db, req("9.9.9.9"), limit, env, t0)));
    expect(r.filter((x) => x.ok)).toHaveLength(3);
  });
  it("never stores the raw IP; uses x-real-ip, else the first x-forwarded-for", async () => {
    const db = wrap(new PGlite()); await runMigrations(db, undefined, () => {});
    await checkLimit(db, req("203.0.113.7"), limit, env);
    expect(JSON.stringify(await db.query(`SELECT * FROM rate_limits`))).not.toContain("203.0.113.7");
    const xff = new Request("https://x.test", { headers: { "x-forwarded-for": "198.51.100.1, 10.0.0.1" } });
    expect(clientHash(xff, "s")).toBe(clientHash(new Request("https://x.test", { headers: { "x-real-ip": "198.51.100.1" } }), "s"));
  });
  it("fails open when the database is unavailable; no database -> allowed", async () => {
    const broken: Db = { query: async () => { throw new Error("down"); }, tx: async () => [] };
    expect((await checkLimit(broken, req("1.1.1.1"), limit, env)).ok).toBe(true);
    expect((await checkLimit(null, req("1.1.1.1"), limit, env)).ok).toBe(true);
  });
  it("purges windows older than a day", async () => {
    const db = wrap(new PGlite()); await runMigrations(db, undefined, () => {});
    await checkLimit(db, req("1.1.1.1"), limit, env, Date.now() - 2 * 86400_000);
    await checkLimit(db, req("1.1.1.1"), limit, env);
    expect(await purgeOldRateLimits(db)).toBe(1);
  });
});
