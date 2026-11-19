import { createHash, timingSafeEqual } from "node:crypto";
import type { DbLedger, ReconcileDeps } from "../db/ledger";

/**
 * Cron runner for reconciliation (ChatGPT note 89). Not scheduled yet: CRON_SECRET stays unset until reviewed.
 *  - Secret comes only from the Authorization header ("Bearer <secret>"), compared in constant time on SHA-256
 *    digests (equal length). Missing/wrong -> generic 401. Never logged.
 *  - Bounded batch, per-item timeout, overall deadline. Overlapping invocations are safe because every item is
 *    claimed atomically inside reconcileDetailed (a second runner gets "skipped").
 *  - Response and logs contain counts only: no attempt keys, booking refs, IDs or PII.
 */
export function authorized(header: string | null, secret: string | undefined): boolean {
  if (!secret || secret.length < 32) return false;
  const m = /^Bearer (.+)$/.exec(header ?? "");
  if (!m) return false;
  const a = createHash("sha256").update(m[1]!).digest(), b = createHash("sha256").update(secret).digest();
  return timingSafeEqual(a, b);
}

export interface RunCounts { due: number; resolved: number; deferred: number; skipped: number; failed: number; manual_review: number; timed_out: number }

export async function runReconciliation(ledger: DbLedger, deps: ReconcileDeps, opts: { batch?: number; itemTimeoutMs?: number; deadlineMs?: number; livemode?: boolean } = {}): Promise<RunCounts> {
  const batch = Math.min(opts.batch ?? 10, 25), itemTimeoutMs = opts.itemTimeoutMs ?? 20_000, deadline = Date.now() + (opts.deadlineMs ?? 45_000);
  const keys = await ledger.pendingReconciliation(batch, opts.livemode ?? false);
  const counts: RunCounts = { due: keys.length, resolved: 0, deferred: 0, skipped: 0, failed: 0, manual_review: 0, timed_out: 0 };
  for (const key of keys) {
    if (Date.now() > deadline) break;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<"timeout">((r) => { timer = setTimeout(() => r("timeout"), itemTimeoutMs); });
    // A timed-out item keeps its claim until claim_expires_at, then another run can reclaim it.
    const res = await Promise.race([ledger.reconcileDetailed(key, deps).catch(() => ({ result: "failed" as const })), timeout]);
    clearTimeout(timer);
    if (res === "timeout") counts.timed_out++;
    else counts[res.result]++;
  }
  return counts;
}
