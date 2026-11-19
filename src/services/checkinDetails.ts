import type { Db } from "@/db/client";
import { HOMES } from "@/content/homes";
import { HOST_EMAIL_DEFAULT } from "@/services/stayChat";
import { sendEmail } from "@/services/email";
import { chicagoInstant, formatChicagoDateTime } from "@/domain/time";

/**
 * Real check-in details for direct bookings (Oscar, Nov 19, audit F1).
 *
 * Source: each home's Hospitable "Check-in Inst." auto-message, pasted once by Oscar in the host inbox with
 * Hospitable's placeholders kept (%guest_first_name%, %guest_phone_last4%, %listing_full_address%…), plus the home's
 * street address. Stored only in the database: never in the code, never on a public page.
 *
 * Release (Oscar's rules):
 *  - address + map link: after BOTH paperwork steps (agreement signed and ID verified);
 *  - the full message (door code = last 4 digits of the guest's phone, gate code, Wi-Fi): from 8:00 AM CT on
 *    check-in day, the same time as the check-in day email, until 3 days after check-out;
 *  - live bookings only. Test bookings (test site) always get sample text, so testers never see real codes.
 * When paperwork completes, Oscar gets "Set door code XXXX at <home>" (locks aren't connected to Hospitable).
 */
export const RELEASE_HOUR = 8;
export const PLACEHOLDERS = [
  "%guest_first_name%", "%guest_last_name%", "%guest_name%", "%guest_phone_last4%", "%listing_full_address%", "%listing_name%",
  "%check_in%", "%check_out%", "%nights%", "%check_in_hour%", "%check_out_hour%", "%reservation_code%",
] as const;

export type CheckinDetails = { propertyKey: string; title?: string; address: string; message: string; updatedAt: string | null };
export type GuestCtx = {
  firstName: string; lastName: string; phone: string; checkIn: string; checkOut: string; bookingRef: string; propertyKey: string;
};

export async function listDetails(db: Db): Promise<CheckinDetails[]> {
  const rows = await db.query<any>(`SELECT property_key, address, message, updated_at FROM checkin_details`);
  const by = new Map(rows.map((r) => [r.property_key, r]));
  return Object.keys(HOMES).map((k) => {
    const r = by.get(k);
    return { propertyKey: k, title: HOMES[k]!.title, address: r?.address ?? "", message: r?.message ?? "", updatedAt: r?.updated_at ? new Date(r.updated_at).toISOString() : null };
  });
}

export async function getDetails(db: Db, key: string): Promise<CheckinDetails | null> {
  const [r] = await db.query<any>(`SELECT property_key, address, message, updated_at FROM checkin_details WHERE property_key = $1`, [key]);
  return r ? { propertyKey: r.property_key, address: r.address, message: r.message, updatedAt: new Date(r.updated_at).toISOString() } : null;
}

export async function saveDetails(db: Db, key: string, d: { address: string; message: string }, by: string) {
  if (!HOMES[key]) throw new Error("unknown home");
  const address = d.address.trim().slice(0, 300), message = d.message.replace(/\r\n/g, "\n").trim().slice(0, 8000);
  await db.query(`INSERT INTO checkin_details (property_key, address, message, updated_at, updated_by) VALUES ($1, $2, $3, now(), $4)
    ON CONFLICT (property_key) DO UPDATE SET address = EXCLUDED.address, message = EXCLUDED.message, updated_at = now(), updated_by = EXCLUDED.updated_by`,
    [key, address, message, by]);
  await db.query(`INSERT INTO audit_log (actor, action, after) VALUES ($1, 'checkin_details_saved', $2)`, [by, JSON.stringify({ home: key })]).catch(() => undefined);
}

/** Placeholders in a message that we don't fill (shown as a warning in the host editor). */
export const unknownPlaceholders = (message: string) =>
  [...new Set(message.match(/%[a-z0-9_]+%/gi) ?? [])].filter((p) => !(PLACEHOLDERS as readonly string[]).includes(p.toLowerCase()));

export const phoneLast4 = (phone: string) => phone.replace(/\D/g, "").slice(-4);

const day = (iso: string) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric", year: "numeric" }).format(new Date(iso + "T00:00:00Z"));

/** Fill Hospitable's placeholders for one guest. Unknown placeholders are removed (never shown raw to guests). */
export function renderMessage(message: string, address: string, g: GuestCtx): string {
  const nights = Math.round((Date.parse(g.checkOut) - Date.parse(g.checkIn)) / 864e5);
  const v: Record<string, string> = {
    "%guest_first_name%": g.firstName, "%guest_last_name%": g.lastName, "%guest_name%": `${g.firstName} ${g.lastName}`.trim(),
    "%guest_phone_last4%": phoneLast4(g.phone), "%listing_full_address%": address, "%listing_name%": HOMES[g.propertyKey]?.title ?? "",
    "%check_in%": day(g.checkIn), "%check_out%": day(g.checkOut), "%nights%": `${nights} ${nights === 1 ? "night" : "nights"}`,
    "%check_in_hour%": "4:00 PM", "%check_out_hour%": "10:00 AM", "%reservation_code%": g.bookingRef,
  };
  return message.replace(/%[a-z0-9_]+%/gi, (m) => v[m.toLowerCase()] ?? "").replace(/[ \t]+\n/g, "\n");
}

export const releaseAt = (checkIn: string) => chicagoInstant(checkIn, RELEASE_HOUR);
export const releaseEnds = (checkOut: string) => new Date(Date.parse(checkOut + "T23:59:59Z") + 3 * 864e5);

export type Arrival =
  | { state: "locked" }                                                   // paperwork not done
  | { state: "test" }                                                     // test booking: sample text only
  | { state: "missing" }                                                  // host hasn't saved this home yet
  | { state: "address"; address: string; releaseText: string }            // before check-in morning
  | { state: "full"; address: string; message: string };                  // check-in morning onward

/** What a stay page may show right now. Server-only. */
export function arrivalFor(o: { livemode: boolean; paperworkDone: boolean; details: CheckinDetails | null; guest: GuestCtx; now?: Date }): Arrival {
  const now = o.now ?? new Date();
  if (!o.paperworkDone) return { state: "locked" };
  if (!o.livemode) return { state: "test" };
  if (!o.details || !o.details.address || !o.details.message) return { state: "missing" };
  const t = now.getTime();
  if (t >= releaseAt(o.guest.checkIn).getTime() && t <= releaseEnds(o.guest.checkOut).getTime())
    return { state: "full", address: o.details.address, message: renderMessage(o.details.message, o.details.address, o.guest) };
  return { state: "address", address: o.details.address, releaseText: formatChicagoDateTime(releaseAt(o.guest.checkIn)) };
}

/**
 * Once per booking, after BOTH paperwork steps: tell the host which 4-digit code to set on the lock.
 * Claims the alert in the database first so two requests never send it twice. Test bookings say TEST.
 */
export async function maybeDoorCodeAlert(db: Db, bookingId: string, env: NodeJS.ProcessEnv = process.env, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const [r] = await db.query<any>(
    `UPDATE verifications v SET door_alert_at = now()
      WHERE v.booking_id = $1 AND v.door_alert_at IS NULL AND v.agreement_signed_at IS NOT NULL AND v.id_checked_at IS NOT NULL AND v.id_status = 'verified'
      RETURNING (SELECT json_build_object('ref', b.booking_ref, 'home', q.property_key, 'ci', q.check_in, 'co', q.check_out, 'first', g.first_name, 'last', g.last_name,
                 'phone', g.phone, 'live', q.livemode)
                 FROM bookings b JOIN quotes q ON q.id = b.quote_id AND q.version = b.quote_version JOIN guests g ON g.id = b.guest_id WHERE b.id = v.booking_id) AS info`,
    [bookingId]);
  const i = r?.info && (typeof r.info === "string" ? JSON.parse(r.info) : r.info);
  if (!i) return false;
  const iso = (d: unknown) => (d instanceof Date ? d.toISOString() : String(d)).slice(0, 10);
  const home = HOMES[i.home]?.title ?? i.home, code = phoneLast4(i.phone), tag = i.live ? "" : "TEST · ";
  const dates = `${day(iso(i.ci))} – ${day(iso(i.co))}`;
  const subject = `${tag}Set door code ${code} · ${home} · ${dates}`;
  const text = `${i.first} ${String(i.last).slice(0, 1)}. finished their paperwork for booking ${i.ref}.\n\nPlease set door code ${code} (last 4 digits of their phone) on the lock at ${home} for ${dates}.\n\nThe stay page shows their check-in details from 8:00 AM CT on check-in day.`;
  const html = `<p>${text.split("\n\n").map((p) => p.replace(/&/g, "&amp;").replace(/</g, "&lt;")).join("</p><p>")}</p>`;
  try { await sendEmail(env.HOST_ALERT_EMAIL || HOST_EMAIL_DEFAULT, { subject, text, html }, `door-code-${bookingId}`, env, fetchImpl); return true; }
  catch (e) {
    // Unclaim so the next paperwork poll or the maintenance run tries again.
    await db.query(`UPDATE verifications SET door_alert_at = NULL WHERE booking_id = $1`, [bookingId]).catch(() => undefined);
    console.error("[checkin] door code alert failed", (e as Error).message);
    return false;
  }
}
