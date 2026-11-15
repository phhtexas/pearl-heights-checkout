import { NextResponse } from "next/server";
import { publicConfig } from "@/server/adapters";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(publicConfig(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ mode: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
