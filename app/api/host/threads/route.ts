import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { currentHost } from "@/server/host";
import { inbox } from "@/services/stayChat";
import { inquiryInbox } from "@/services/inquiries";

/** Host inbox: every guest thread and every question before booking, newest first (signed-in host only). */
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };

export async function GET() {
  const db = getDb();
  if (!db || !(await currentHost())) return NextResponse.json({ error: "Sign in" }, { status: 401, headers: noStore });
  return NextResponse.json({ threads: await inbox(db), inquiries: await inquiryInbox(db) }, { headers: noStore });
}
