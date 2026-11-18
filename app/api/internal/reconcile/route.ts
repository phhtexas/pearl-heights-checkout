import { NextResponse } from "next/server";
import { authorized, runReconciliation } from "@/server/reconcileRunner";
import { getAdapters, getLedger } from "@/server/adapters";
import { DbLedger } from "@/db/ledger";
import { getDb } from "@/db/client";
import { runDueSecondCharges } from "@/services/secondCharge";
import { purgeOldRateLimits } from "@/server/rateLimit";
import { getProperty } from "@/domain/properties";
import { verificationDeadline } from "@/domain/verification";
import { sweepCheckinMessages } from "@/services/checkinMessageSweep";

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
  const reconciliation = await runReconciliation(ledger, { hosp, pay, propertyUuid: (k) => getProperty(k).hospitableUuid, verification: (ci) => verificationDeadline(new Date(), ci) });
  const secondCharges = await runDueSecondCharges(getDb()!, pay);
  const rateLimitWindowsPurged = await purgeOldRateLimits(getDb()!).catch(() => 0);
  // Once an hour (the cron runs every minute): make sure no direct booking still has a Hospitable door-code message.
  const checkinMessages = new Date().getUTCMinutes() === 7 ? await sweepCheckinMessages(getDb()!, hosp).catch(() => null) : undefined;
  const counts = { reconciliation, secondCharges, rateLimitWindowsPurged, ...(checkinMessages !== undefined ? { checkinMessages } : {}) };
  console.info("maintenance run", JSON.stringify(counts));
  return NextResponse.json(counts, { headers: noStore });
}

export const GET = handle;
export const POST = handle;
