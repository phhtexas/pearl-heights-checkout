import { NextResponse } from "next/server";
import { publicConfig } from "@/server/adapters";
import { envForRequest } from "@/server/mode";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    return NextResponse.json(publicConfig(envForRequest(req)), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ mode: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
