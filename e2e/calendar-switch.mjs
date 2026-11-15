// Rapid property-switch race test (ChatGPT note 76). Run against a local `next start` in mock mode:
//   CHECKOUT_MODE=mock ALLOW_MOCK=true npx next start -p 3100 & node e2e/calendar-switch.mjs http://localhost:3100
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
const base = process.argv[2] ?? "http://localhost:3100";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
// Slow down calendar responses in random order so older responses can arrive after newer ones.
await page.route("**/api/calendar**", async (route) => { await new Promise((r) => setTimeout(r, 100 + Math.random() * 700)); await route.continue(); });
await page.goto(base);
const names = { edgewood: "Edgewood House", "752": "752 Myrtle", "736": "736 Myrtle", indianola: "613 Indianola", claywell: "The Claywell" };
const keys = Object.keys(names);
let failures = 0;
for (let round = 0; round < 6; round++) {
  // click through several homes quickly, end on a random one
  const seq = [...keys].sort(() => Math.random() - 0.5);
  for (const k of seq) await page.getByRole("button", { name: new RegExp("^" + names[k]) }).click();
  const final = seq.at(-1);
  await page.waitForFunction(() => document.querySelectorAll("button.day small").length > 0 && [...document.querySelectorAll("button.day small")].some((s) => s.textContent));
  await page.waitForTimeout(1200); // let any stale responses land
  const shown = await page.$$eval("button.day", (bs) => bs.map((b) => [b.getAttribute("aria-label"), b.querySelector("small")?.textContent ?? ""]).filter(([, p]) => p));
  const truth = await page.evaluate(async (k) => (await (await fetch(`/api/calendar?property=${k}`)).json()).days, final);
  const byDate = Object.fromEntries(truth.map((d) => [d.date, d]));
  const bad = shown.filter(([date, price]) => !byDate[date]?.available || "$" + byDate[date].price / 100 !== price);
  console.log(`round ${round + 1}: final=${final} shown=${shown.length} mismatches=${bad.length}`);
  if (bad.length) { failures++; console.log("  e.g.", bad.slice(0, 3)); }
}
await browser.close();
if (failures) { console.error(`FAIL: ${failures} round(s) showed another home's prices`); process.exit(1); }
console.log("PASS: displayed nightly prices always matched the selected home");
