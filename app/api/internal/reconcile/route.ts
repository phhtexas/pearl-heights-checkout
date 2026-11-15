import { NextResponse } from "next/server";
import { authorized, runReconciliation } from "@/server/reconcileRunner";
import { getAdapters, getLedger } from "@/server/adapters";
import { DbLedger } from "@/db/ledger";
import { getProperty } from "@/domain/properties";
import { verificationDeadline } from "@/domain/verification";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const noStore = { "Cache-Control": "no-store" };

/** POST only (GET and others get 405 from Next). Not scheduled until CRON_SECRET is set after review. */
export async function POST(req: Request) {
  if (!process.env.CRON_SECRET) return NextResponse.json({ error: "Not configured" }, { status: 503, headers: noStore });
  if (!authorized(req.headers.get("authorization"), process.env.CRON_SECRET)) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: noStore });
  const { ledger } = getLedger(process.env, "reconciler");
  if (!(ledger instanceof DbLedger)) return NextResponse.json({ error: "Not configured" }, { status: 503, headers: noStore });
  const { hosp, pay } = getAdapters("none", process.env, "reconciler");
  const counts = await runReconciliation(ledger, { hosp, pay, propertyUuid: (k) => getProperty(k).hospitableUuid, verification: (ci) => verificationDeadline(new Date(), ci) });
  console.info("reconcile run", JSON.stringify(counts));
  return NextResponse.json(counts, { headers: noStore });
}
