import { NextResponse } from "next/server";
import { authorized, runReconciliation } from "@/server/reconcileRunner";
import { getAdapters, getLedger } from "@/server/adapters";
import { envForMode, liveSwitchOn } from "@/server/mode";
import { DbLedger } from "@/db/ledger";
import { getDb } from "@/db/client";
import { runDueSecondCharges } from "@/services/secondCharge";
import { purgeOldRateLimits } from "@/server/rateLimit";
import { getProperty } from "@/domain/properties";
import { verificationDeadline } from "@/domain/verification";
import { sweepCheckinMessages } from "@/services/checkinMessageSweep";
import { sweepGuestNotices } from "@/services/guestNotices";
import { alertHostPaymentIssues } from "@/services/paymentAlerts";
import { redactDueVerifications } from "@/services/idRedaction";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const noStore = { "Cache-Control": "no-store" };

/**
 * Reconciliation runner. GET is what Vercel Cron sends (with Authorization: Bearer $CRON_SECRET); POST is kept for
 * controlled manual runs. Both go through this one handler (ChatGPT note 91, approved by Oscar Nov 14, 2026).
 * Authentication is ONLY the Authorization header: never user agent, query string or cookies.
 * Not scheduled: no cron entry in vercel.json and CRON_SECRET unset until the next review.
 */
async function handle(req: Request): Promise<Response> {
  if (!process.env.CRON_SECRET) return NextResponse.json({ error: "Not configured" }, { status: 503, headers: noStore });
  if (!authorized(req.headers.get("authorization"), process.env.CRON_SECRET)) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: noStore });
  const { ledger } = getLedger(process.env, "reconciler");
  if (!(ledger instanceof DbLedger)) return NextResponse.json({ error: "Not configured" }, { status: 503, headers: noStore });
  const { hosp, pay } = getAdapters("none", process.env, "reconciler");
  const deps = (h: typeof hosp, p: typeof pay) => ({ hosp: h, pay: p, propertyUuid: (k: string) => getProperty(k).hospitableUuid, verification: (ci: string) => verificationDeadline(new Date(), ci) });
  const reconciliation = await runReconciliation(ledger, deps(hosp, pay));
  const secondCharges = await runDueSecondCharges(getDb()!, pay);
  // Live bookings (pearlheightshomes.com) get the same runs with the LIVE keys; test and live records never mix.
  // Also runs if the switch is turned off later, while live bookings still have balances due.
  let live: { reconciliation: unknown; secondCharges: unknown } | undefined;
  let liveHosp: typeof hosp | undefined;
  const hasLive = liveSwitchOn() || (await (async () => getDb()!.query(`SELECT 1 FROM quotes WHERE livemode LIMIT 1`))().catch(() => [])).length > 0;
  if (hasLive) {
    try {
      const L = getAdapters("none", envForMode("live"), "reconciler-live");
      liveHosp = L.hosp;
      live = {
        reconciliation: await runReconciliation(ledger, deps(L.hosp, L.pay), { livemode: true }),
        secondCharges: await runDueSecondCharges(getDb()!, L.pay, 10, true),
      };
    } catch (e) { console.error("[maintenance] live run skipped:", String((e as Error).message).slice(0, 200)); }
  }
  const rateLimitWindowsPurged = await purgeOldRateLimits(getDb()!).catch(() => 0);
  // F17: tell the host about second payments that need attention (bank approval, unpaid after 72 h, manual review).
  const paymentAlerts = await alertHostPaymentIssues(getDb()!, process.env.HOST_ORIGIN || "https://pearl-heights-checkout.vercel.app").catch(() => ({ sent: 0, failed: 1 }));
  // Once an hour (the cron runs every minute): make sure no direct booking still has a Hospitable door-code message.
  const checkinMessages = new Date().getUTCMinutes() === 7 ? await sweepCheckinMessages(getDb()!, liveHosp ?? hosp).catch(() => ({ checked: 0, cancelled: 0, failed: 1 })) : undefined;
  // Every 5 minutes: guest reminders and notices (off until GUEST_EMAILS=on). Links use the public site address.
  const guestNotices = new Date().getUTCMinutes() % 5 === 3
    ? await sweepGuestNotices(getDb()!, process.env.PUBLIC_ORIGIN || "https://pearlheightshomes.com").catch((e) => { console.error("guest notices", String(e?.message ?? e)); return { checked: 0, sent: 0, failed: 1 }; })
    : undefined;
  // Once an hour: ask Stripe to redact ID checks 120 days after check-out (Privacy Notice §4, §10).
  const idRedaction = new Date().getUTCMinutes() === 23 ? await redactDueVerifications(getDb()!).catch(() => ({ due: 0, redacted: 0, failed: 1 })) : undefined;
  const counts = { reconciliation, secondCharges, ...(live ? { live } : {}), rateLimitWindowsPurged, paymentAlerts, ...(checkinMessages !== undefined ? { checkinMessages } : {}), ...(guestNotices !== undefined ? { guestNotices } : {}), ...(idRedaction !== undefined ? { idRedaction } : {}) };
  console.info("maintenance run", JSON.stringify(counts));
  return NextResponse.json(counts, { headers: noStore });
}

export const GET = handle;
export const POST = handle;
