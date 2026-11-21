import { buildStay, demoStay, stayPayments, type StayData } from "@/content/stayDemo";
import { HOMES } from "@/content/homes";
import { getDb } from "@/db/client";
import { loadStay, type StayRow } from "@/services/stayLinks";
import { cardLabel } from "@/services/emailBlocks";
import { getAdapters } from "@/server/adapters";
import { envForLivemode } from "@/server/mode";

/** "Visa •••• 4242" for the booking's first payment, from Stripe. Never holds up the page: gives up after 2.5 s. */
async function cardFor(r: StayRow): Promise<string | undefined> {
  if (!r.firstPi) return undefined;
  try {
    const pay = getAdapters("none", envForLivemode(r.livemode)).pay;
    const c = await Promise.race([pay.cardSummary?.({ paymentIntentId: r.firstPi }) ?? null, new Promise<null>((ok) => setTimeout(() => ok(null), 2500))]);
    return cardLabel(c);
  } catch { return undefined; }
}

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
    babyGear: r.babyGear,
    payments: stayPayments({ totalCents: r.totalCents, paidNowCents: r.paidNowCents ?? r.totalCents, paidAt: new Date(r.confirmedAt),
      balance: r.balance ? { cents: r.balance.cents, dueAt: new Date(r.balance.dueAt), status: r.balance.status } : null, card: await cardFor(r) }),
  });
}


/** The booking row behind a real stay link (for the paperwork APIs). Never for "demo". */
export async function bookingForToken(token: string): Promise<StayRow | null> {
  if (token === "demo") return null;
  const db = getDb();
  return db ? loadStay(db, token).catch(() => null) : null;
}

/**
 * Who may use the paperwork APIs for a link: the sample portal in sandbox builds, or a real booking. A booking's
 * paperwork uses the same mode it was paid in (row.livemode): test bookings get a SignWell TEST document and a Stripe
 * TEST ID check; live bookings (pearlheightshomes.com) get the real ones.
 */
export type PaperworkCtx =
  | { kind: "demo"; stay: StayData }
  | { kind: "booking"; stay: StayData; row: StayRow };
export async function paperworkFor(token: string): Promise<PaperworkCtx | null> {
  if (token === "demo") return process.env.NEXT_PUBLIC_SANDBOX === "true" ? { kind: "demo", stay: demoStay() } : null;
  const row = await bookingForToken(token);
  if (!row) return null;
  const stay = await stayForToken(token);
  return stay ? { kind: "booking", stay, row } : null;
}
