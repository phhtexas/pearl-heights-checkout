// Rapid property-switch race test (ChatGPT note 76), Checkout E version: switch homes quickly with the test bar's
// home picker while calendar responses arrive late and out of order; the prices shown must always be the final home's.
// Run: ALLOW_MOCK=true npx next start -p 3401 ; node e2e/calendar-switch.mjs http://localhost:3401
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
const base = process.argv[2] ?? process.env.BASE_URL ?? "http://localhost:3401";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.route("**/api/calendar**", async (route) => { await new Promise((r) => setTimeout(r, 100 + Math.random() * 700)); await route.continue(); });
await page.goto(base);
await page.waitForSelector('[aria-label="Change dates"]');
// Look a couple of months ahead, where every home has open nights to compare.
await page.getByLabel("Next month").click(); await page.getByLabel("Next month").click();
const keys = ["edgewood", "752", "736", "indianola", "claywell"];
// "Thu, Dec 3, 2026, $305 per night" -> "2026-12-03"
const isoOf = (label) => { const [, md, y] = label.split(", "); return new Date(`${md}, ${y} 12:00 UTC`).toISOString().slice(0, 10); };
let failures = 0, checked = 0;
for (let round = 0; round < 6; round++) {
  const seq = [...keys].sort(() => Math.random() - 0.5);
  for (const k of seq) await page.selectOption(".testbar select", k);
  const final = seq.at(-1);
  await page.waitForFunction(() => [...document.querySelectorAll("button.day small")].some((s) => s.textContent), null, { timeout: 8000 }).catch(() => undefined);
  await page.waitForTimeout(1200); // let any stale responses land
  const shown = await page.$$eval("button.day", (bs) => bs.map((b) => [b.getAttribute("aria-label"), b.querySelector("small")?.textContent ?? ""]).filter(([, p]) => p));
  const truth = await page.evaluate(async (k) => (await (await fetch(`/api/calendar?property=${k}`)).json()).days, final);
  const byDate = Object.fromEntries(truth.map((d) => [d.date, d]));
  const bad = shown.filter(([label, price]) => { const d = byDate[isoOf(label)]; return !d?.available || "$" + Math.round(d.price / 100) !== price; });
  console.log(`round ${round + 1}: final=${final} shown=${shown.length} mismatches=${bad.length}`);
  if (bad.length) { failures++; console.log("  e.g.", bad.slice(0, 3)); }
  if (shown.length) checked++;
}
if (checked < 4) { console.error(`FAIL: only ${checked} round(s) had prices to compare`); process.exit(1); }
await browser.close();
if (failures) { console.error(`FAIL: ${failures} round(s) showed another home's prices`); process.exit(1); }
console.log("PASS: displayed nightly prices always matched the selected home");
