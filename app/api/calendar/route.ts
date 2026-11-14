import { NextResponse } from "next/server";
import { getProperty } from "@/domain/properties";
import { getAdapters } from "@/server/adapters";

export async function GET(req: Request) {
  const url = new URL(req.url);
  try {
    const p = getProperty(url.searchParams.get("property") ?? "");
    const { hosp } = getAdapters();
    const days = await hosp.getCalendar(p.hospitableUuid, url.searchParams.get("start") ?? "2026-11-15", url.searchParams.get("end") ?? "2027-05-31");
    return NextResponse.json({ days });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
