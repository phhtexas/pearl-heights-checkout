// Route-level tests for the reconciliation runner (ChatGPT note 91): GET (Vercel Cron) and POST share one handler.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SECRET = "s".repeat(48);
const run = vi.fn(async () => ({ due: 1, resolved: 1, deferred: 0, skipped: 0, failed: 0, manual_review: 0, timed_out: 0 }));
vi.mock("@/server/reconcileRunner", async (orig) => ({ ...(await orig<typeof import("../src/server/reconcileRunner")>()), runReconciliation: run }));
const charges = vi.fn(async () => ({ due: 0, paid: 0, retry_scheduled: 0, failed_final: 0, skipped: 0, ambiguous: 0 }));
vi.mock("@/services/secondCharge", () => ({ runDueSecondCharges: charges }));
vi.mock("@/db/client", () => ({ getDb: () => ({}) }));
vi.mock("@/server/rateLimit", () => ({ purgeOldRateLimits: async () => 0 }));
vi.mock("@/server/adapters", async () => {
  const { DbLedger } = await import("../src/db/ledger");
  return { getLedger: () => ({ ledger: Object.create(DbLedger.prototype), durable: true }), getAdapters: () => ({ hosp: {}, pay: {} }) };
});

const route = await import("../app/api/internal/reconcile/route");
const call = (method: "GET" | "POST", auth?: string, extra: Record<string, string> = {}) =>
  (route as any)[method](new Request("https://x.test/api/internal/reconcile?secret=" + SECRET, { method, headers: { ...(auth ? { authorization: auth } : {}), ...extra } }));

beforeEach(() => { run.mockClear(); charges.mockClear(); });
afterEach(() => { delete process.env.CRON_SECRET; });

describe.each(["GET", "POST"] as const)("%s /api/internal/reconcile", (method) => {
  it("CRON_SECRET unset -> 503, runner not called", async () => {
    const r = await call(method, `Bearer ${SECRET}`);
    expect(r.status).toBe(503);
    expect(await r.json()).toEqual({ error: "Not configured" });
    expect(run).not.toHaveBeenCalled();
    expect(charges).not.toHaveBeenCalled();
  });
  it("missing or wrong bearer -> generic 401 (query string, cookie, user agent ignored)", async () => {
    process.env.CRON_SECRET = SECRET;
    for (const auth of [undefined, `Bearer ${SECRET}x`, SECRET, `Basic ${SECRET}`]) {
      const r = await call(method, auth, { cookie: `secret=${SECRET}`, "user-agent": "vercel-cron/1.0" });
      expect(r.status).toBe(401);
      expect(await r.json()).toEqual({ error: "Unauthorized" });
    }
    expect(run).not.toHaveBeenCalled();
  });
  it("exact bearer -> runner invoked once; counts only; no-store", async () => {
    process.env.CRON_SECRET = SECRET;
    const r = await call(method, `Bearer ${SECRET}`);
    expect(r.status).toBe(200);
    expect(run).toHaveBeenCalledTimes(1);
    expect(charges).toHaveBeenCalledTimes(1);
    expect(r.headers.get("cache-control")).toBe("no-store");
    const body = await r.json();
    expect(Object.keys(body).sort()).toEqual(["rateLimitWindowsPurged", "reconciliation", "secondCharges"]);
    const leaves = (o: any): unknown[] => (typeof o === "object" ? Object.values(o).flatMap(leaves) : [o]);
    expect(leaves(body).every((v) => typeof v === "number")).toBe(true); // counts only
  });
});

it("GET and POST are the same handler", () => expect((route as any).GET).toBe((route as any).POST));
