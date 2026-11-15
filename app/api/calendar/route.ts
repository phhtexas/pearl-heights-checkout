import { NextResponse } from "next/server";
import { getProperty } from "@/domain/properties";
import { getAdapters } from "@/server/adapters";
import { readSession, withSession } from "@/server/session";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const session = readSession(req);
  try {
    const p = getProperty(url.searchParams.get("property") ?? "");
    const { hosp } = getAdapters("none", process.env, session.id);
    const days = await hosp.getCalendar(p.hospitableUuid, url.searchParams.get("start") ?? "2026-11-15", url.searchParams.get("end") ?? "2027-05-31");
    return withSession(NextResponse.json({ property: p.key, days }, { headers: { "Cache-Control": "no-store" } }), session);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
