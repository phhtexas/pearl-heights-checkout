import { NextResponse } from "next/server";
import { getProperty } from "@/domain/properties";
import { getAdapters } from "@/server/adapters";
import { readSession, withSession } from "@/server/session";
import { addDaysISO } from "@/domain/time";

export const dynamic = "force-dynamic";
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Today in Central time (YYYY-MM-DD). */
const todayCT = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date());

export async function GET(req: Request) {
  const url = new URL(req.url);
  const session = readSession(req);
  let p;
  try { p = getProperty(url.searchParams.get("property") ?? ""); }
  catch { return NextResponse.json({ error: "Unknown home." }, { status: 400 }); }
  const start = ISO.test(url.searchParams.get("start") ?? "") ? url.searchParams.get("start")! : todayCT();
  const end = ISO.test(url.searchParams.get("end") ?? "") ? url.searchParams.get("end")! : addDaysISO(start, 240);
  try {
    const { hosp } = getAdapters("none", process.env, session.id);
    const days = await hosp.getCalendar(p.hospitableUuid, start, end);
    return withSession(NextResponse.json({ property: p.key, days }, { headers: { "Cache-Control": "no-store" } }), session);
  } catch (e) {
    console.error("calendar error", (e as Error).message);
    return NextResponse.json({ error: "Availability is temporarily unavailable. Please try again." }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
