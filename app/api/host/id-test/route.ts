import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { currentHost } from "@/server/host";
import { envForMode } from "@/server/mode";
import { LIMITS, checkLimit, tooMany } from "@/server/rateLimit";
import { getIdState, identityClient } from "@/services/identity";

/**
 * Supervised LIVE ID self-test (Oscar, Nov 20), signed-in host only, next to the $1 card test. Proves Stripe Identity
 * is turned on for live use and the live restricted key has the Identity permission, using Oscar's own ID once
 * (Stripe: first 50 checks free, then $1.50). Same settings as a guest's check (document + matching live selfie).
 * POST -> creates a live verification session and returns Stripe's page to open.
 * GET ?vs= -> reads the result (status only, never the ID data); once finished, asks Stripe to delete (redact) the ID
 * images and data right away. Nothing is written to bookings.
 */
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };
const SESSION = /^vs_[A-Za-z0-9]{8,64}$/;

export async function POST(req: Request) {
  if (!(await currentHost())) return NextResponse.json({ error: "Sign in" }, { status: 401, headers: noStore });
  const lim = await checkLimit(getDb(), req, LIMITS.testEmail); // 3 per hour
  if (!lim.ok) return tooMany(lim.retryAfterS);
  try {
    const client = identityClient(envForMode("live"));
    const origin = new URL(req.url).origin;
    const s = await client.verificationSessions.create({
      type: "document",
      options: { document: { require_matching_selfie: true, require_live_capture: true } },
      metadata: { live_id_test: "true", note: "Pearl Heights live ID self-test, redacted after" },
      return_url: `${origin}/host/card-test?vs={VERIFICATION_SESSION_ID}`,
    });
    if (s.livemode !== true) return NextResponse.json({ error: "Stripe made a TEST session: the live key isn't a live key." }, { status: 503, headers: noStore });
    return NextResponse.json({ url: s.url, id: s.id }, { headers: noStore });
  } catch (e) {
    const x = e as { code?: string; message?: string; type?: string };
    // Typical: Identity not activated for live use, or the restricted key lacks "Identity verification sessions: write".
    return NextResponse.json({ error: `Couldn't start a live ID check: ${`${x.code ?? x.type ?? ""} ${String(x.message ?? "")}`.trim().slice(0, 240)}` }, { status: 502, headers: noStore });
  }
}

export async function GET(req: Request) {
  if (!(await currentHost())) return NextResponse.json({ error: "Sign in" }, { status: 401, headers: noStore });
  const id = new URL(req.url).searchParams.get("vs") ?? "";
  if (!SESSION.test(id)) return NextResponse.json({ error: "Bad session" }, { status: 400, headers: noStore });
  const env = envForMode("live");
  try {
    const st = await getIdState(id, identityClient(env));
    if (st.metadata.live_id_test !== "true") return NextResponse.json({ error: "Not a test session" }, { status: 400, headers: noStore });
    let redacted = false;
    if (st.status === "verified" || st.status === "canceled") {
      redacted = await identityClient(env).verificationSessions.redact(id).then(() => true).catch(() => false);
    }
    return NextResponse.json({ status: st.status, live: !st.testMode, lastError: st.lastError ?? null, redacted }, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message).slice(0, 200) }, { status: 502, headers: noStore });
  }
}
