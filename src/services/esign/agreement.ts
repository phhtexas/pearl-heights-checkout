import { urgentContact } from "../../server/stayContact";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { HOMES } from "@/content/homes";
import { LEGAL_VERSION, OPERATOR, parseLegal, type Block } from "@/content/legal";
import { SCHEDULE_FIELDS, agreementSchedule, draftSchedule, scheduleGaps, type PropertySchedule } from "@/domain/propertySchedule";

/**
 * The Rental Agreement (V1.2, src/content/legal/rental-agreement.md) rendered as one HTML file for SignWell, with the
 * reservation merge fields and the home's Property Schedule filled in, and SignWell text tags for the guest's
 * signature and signing date only (the section 24 acknowledgments are confirmed by signing; Oscar, Nov 17) (SignWell docs: Adding Text Tags / Text Tag Options).
 *
 * STRICT (real bookings): agreementSchedule() must pass, so an agreement is never produced with a gap.
 * TEST (testMode): gaps are filled with a visible "TEST: not yet provided" so the flow can be tried end to end.
 * The property address is never put in the agreement before verification (the agreement itself says it's released after).
 */
export interface AgreementInput {
  bookingId: string;
  propertyKey: string;
  holder: { name: string; email: string; mobile?: string };
  checkIn: string; checkOut: string;
  guests: { adults: number; children: number; infants: number };
  price: { total: string; paidNow: string; balance?: string; balanceDate?: string };
  urgentContact?: string;
  testMode: boolean;
}

/** Oscar, Nov 17 (option 1): the guest's name is an editable field INSIDE the agreement, prefilled from the reservation.
 * SignWell text tag options (docs, read Nov 17): t:signer:required:label:prefill:api_id. Colons and braces would break
 * the tag, so they're stripped from the prefill. Spaces inside the tag set the field's width. */
export const legalNameTag = (name: string) => `{{t:1:y:Full legal name:${name.replace(/[:{}\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80)}:legal_name:340:40}}` + " ".repeat(30);
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const day = (iso: string) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
const TEST_GAP = "TEST: not yet provided";

export function agreementSchedulefor(i: AgreementInput): PropertySchedule {
  // Live agreements always carry the urgent contact (server-only number, Legal note 9).
  if (!i.testMode) return agreementSchedule(i.propertyKey, i.urgentContact ?? urgentContact());
  const d = draftSchedule(i.propertyKey, i.urgentContact ?? TEST_GAP);
  const gaps = new Set(scheduleGaps(d));
  return Object.fromEntries(SCHEDULE_FIELDS.map(([k, label]) => [k, gaps.has(label) ? TEST_GAP : d[k]!])) as PropertySchedule;
}

export function agreementHtml(i: AgreementInput): string {
  const home = HOMES[i.propertyKey];
  if (!home) throw new Error(`Unknown property ${i.propertyKey}`);
  const s = agreementSchedulefor(i);
  const src = readFileSync(join(process.cwd(), "src/content/legal", "rental-agreement.md"), "utf8");
  const merge: Record<string, string> = {
    "[Booking ID]": i.bookingId,
    "[Property name]": home.title,
    "[Property address]": "shown in the guest portal after signing and ID verification",
    "[Full name] · [Email] · [Mobile]": [i.holder.name, i.holder.email, i.holder.mobile].filter(Boolean).join(" · "),
    "Check-in [date] after [time] CT · Check-out [date] before [time] CT": `Check-in ${day(i.checkIn)} after 4:00 PM CT · Check-out ${day(i.checkOut)} before 10:00 AM CT`,
    "[Adults] adults · [Children] children · [Infants] infants · Maximum [occupancy]": `${i.guests.adults} adults · ${i.guests.children} children · ${i.guests.infants} infants · Maximum ${home.capacity.guests}`,
    "Total [total] · Paid now [amount] · Scheduled balance [amount] on [date]": `Total ${i.price.total} · Paid now ${i.price.paidNow}` + (i.price.balance ? ` · Scheduled balance ${i.price.balance} on ${i.price.balanceDate}` : " · No scheduled balance"),
    "Website Terms [version] · Booking Terms [version] · Privacy [version] · Agreement [version]": `Website Terms ${LEGAL_VERSION} · Booking Terms ${LEGAL_VERSION} · Privacy ${LEGAL_VERSION} · Agreement ${LEGAL_VERSION}`,
    "[Maximum occupancy and visitor rule]": s.maxOccupancy,
    "[Parking limit and locations]": s.parking,
    "[Property quiet hours]": s.quietHours,
    "[Camera count, locations, fields of view and audio]": s.exteriorCameras,
    "[Pool, fire, grill, stairs, balcony, gate or other features]": s.features,
    "[Property-specific rules]": s.rules,
    "[Applicable STR permit or registration]": s.registration,
    "[Urgent support method]": s.urgentContact,
  };
  const fill = (t: string) => Object.entries(merge).reduce((acc, [k, v]) => acc.split(k).join(v), t);
  const blocks = parseLegal("ra", src).filter((b) => !(b.t === "note") && !(b.t === "p" && /^This agreement is generated/.test(b.text)));
  // Hidden text tags: SignWell keeps tag text in the document, so it is written in white (their recommendation).
  const tag = (t: string, tall = false) => `<span style="color:#ffffff;font-size:${tall ? 34 : 20}px;line-height:1.4">${t}</span>`;
  const html: string[] = [];
  let section = "";
  for (const b of blocks as Block[]) {
    if (b.t === "h") { section = b.text; html.push(`<h2>${b.num ? `${esc(b.num)} ` : ""}${esc(b.text)}</h2>`); continue; }
    if (b.t === "sub") { html.push(`<h3>${esc(b.text)}</h3>`); continue; }
    if (b.t === "p") { html.push(`<p>${esc(fill(b.text))}</p>`); continue; }
    if (b.t === "ul") {
      if (section === "Guest acknowledgments") {
        // Oscar, Nov 17: no checkbox per line (too many taps); the guest confirms them all by signing.
        html.push(`<p><b>By signing below, I confirm that:</b></p><ul>${b.items.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`);
      } else html.push(`<ul>${b.items.map((x) => `<li>${esc(fill(x))}</li>`).join("")}</ul>`);
      continue;
    }
    if (b.t === "table") {
      if (section === "Signatures") {
        // Oscar, Nov 17: bigger fields, one per line. Sizes are set with SignWell options 7 and 8 (width,
        // height in px); spaces don't work because HTML collapses them. The date fills itself in when the guest signs.
        html.push(`<div class="sigBox"><p class="sigHead">Reservation holder</p>
<p class="sigLbl">Full legal name (as on your ID)</p><p class="sigF">${tag(esc(legalNameTag(i.holder.name)))}</p>
<p class="sigLbl">Signature</p><p class="sigF">${tag("{{s:1:y:::signature:340:64}}", true)}</p>
<p class="sigLbl">Date signed (filled in automatically)</p><p class="sigF">${tag("{{af_d_s:1:y:::date_signed:200:40}}")}</p></div>
<div class="sigBox"><p class="sigHead">Pearl Heights Homes</p><p>${esc(OPERATOR)}<br>Accepted electronically when this agreement is completed.</p></div>`);
        continue;
      }
      html.push(`<table><tr>${b.head.map((h) => `<th>${esc(fill(h))}</th>`).join("")}</tr>${b.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(fill(c))}</td>`).join("")}</tr>`).join("")}</table>`);
    }
  }
  // Anything still in [brackets] is an open launch item (e.g. the commercial mailing address): live mode refuses to
  // produce the agreement; test mode marks it visibly.
  const leftover = html.join("").match(/\[[^\]]{2,60}\]/g);
  if (leftover && !i.testMode) throw new Error(`Unfilled agreement fields: ${[...new Set(leftover)].join(", ")}`);
  if (i.testMode) for (let k = 0; k < html.length; k++) html[k] = html[k]!.replace(/\[([^\]]{2,60})\]/g, "(TEST: $1)");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Rental Agreement and House Rules</title><style>
body{font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:#1d1a17;margin:36px}
h1{font-size:20px;margin:0 0 4px}h2{font-size:14px;margin:20px 0 6px}h3{font-size:12.5px;margin:14px 0 4px}
table{border-collapse:collapse;width:100%;margin:6px 0}th,td{border:1px solid #d8d1c6;padding:6px 8px;text-align:left;vertical-align:top}
th{background:#f3efe9}.ack td{border:0;padding:4px 6px}.ack td.box{width:28px}.sigBox{border:1px solid #e6dfd5;border-radius:8px;padding:12px 16px;margin:12px 0}.sigHead{font-weight:bold;font-size:13px;margin:0 0 8px}.sigLbl{margin:12px 0 2px;font-size:12px;color:#6b635a}.sigF{margin:0;border-bottom:1px solid #cfc6b9;padding:2px 0 6px}
.test{background:#fff3cd;border:1px solid #e0b84f;padding:8px;margin:0 0 12px}
</style></head><body>
${i.testMode ? `<p class="test"><b>TEST DOCUMENT</b>: sample reservation for testing only. Not a real booking and not binding.</p>` : ""}
<h1>Rental Agreement and House Rules</h1><p>Version ${LEGAL_VERSION} · ${esc(OPERATOR)}</p>
${html.join("\n")}
</body></html>`;
}
