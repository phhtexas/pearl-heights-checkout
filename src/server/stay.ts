import { buildStay, demoStay, type StayData } from "@/content/stayDemo";
import { HOMES } from "@/content/homes";
import { getDb } from "@/db/client";
import { loadStay, type StayRow } from "@/services/stayLinks";

/** Server-only: the portal data behind a stay link ("demo" in sandbox builds, else a real booking). */
export async function stayForToken(token: string): Promise<StayData | null> {
  if (token === "demo") return process.env.NEXT_PUBLIC_SANDBOX === "true" ? demoStay() : null;
  const db = getDb();
  if (!db) return null;
  const r = await loadStay(db, token).catch(() => null);
  if (!r || !HOMES[r.propertyKey]) return null;
  return buildStay({
    token, code: r.bookingRef, homeKey: r.propertyKey, checkIn: r.checkIn, checkOut: r.checkOut, adults: r.adults, children: r.children,
    holder: `${r.firstName} ${r.lastName}`.trim(), paidAt: new Date(r.confirmedAt), deadline: r.deadlineAt ? new Date(r.deadlineAt) : null, mode: "booking",
    done: {
      ...(r.agreementSignedAt ? { signedOn: r.agreementSignedAt, signedName: r.agreementSignedName ?? undefined, signDoc: r.signwellDocumentId ?? undefined } : {}),
      ...(r.idCheckedAt && r.idStatus === "verified" ? { verifiedOn: r.idCheckedAt } : {}),
    },
  });
}


/** The booking row behind a real stay link (for the paperwork APIs). Never for "demo". */
export async function bookingForToken(token: string): Promise<StayRow | null> {
  if (token === "demo") return null;
  const db = getDb();
  return db ? loadStay(db, token).catch(() => null) : null;
}

/**
 * Who may use the paperwork APIs for a link: the sample portal in sandbox builds, or a real booking while checkout
 * runs in TEST mode (Oscar, Nov 17: real bookings, test mode first). Live mode stays off until launch sign-off.
 */
export type PaperworkCtx =
  | { kind: "demo"; stay: StayData }
  | { kind: "booking"; stay: StayData; row: StayRow };
export async function paperworkFor(token: string): Promise<PaperworkCtx | null> {
  if (token === "demo") return process.env.NEXT_PUBLIC_SANDBOX === "true" ? { kind: "demo", stay: demoStay() } : null;
  if ((process.env.CHECKOUT_MODE ?? "mock") === "live") return null;
  const row = await bookingForToken(token);
  if (!row) return null;
  const stay = await stayForToken(token);
  return stay ? { kind: "booking", stay, row } : null;
}
