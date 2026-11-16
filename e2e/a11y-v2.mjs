// Note 150 item 6: accessibility of V2 listing + checkout. axe scan of each state + keyboard behavior.
// Run: AXE_PATH=/path/to/axe.min.js BASE_URL=http://localhost:3401 node e2e/a11y-v2.mjs
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const { chromium, devices } = createRequire(import.meta.url)("playwright");
const BASE = process.env.BASE_URL ?? "http://localhost:3401";
const AXE = readFileSync(process.env.AXE_PATH, "utf8");
const ok = (c, m) => { console.log((c ? "ok  - " : "FAIL- ") + m); if (!c) process.exitCode = 1; };
const b = await chromium.launch();

async function axe(page, label) {
  await page.addScriptTag({ content: AXE });
  const r = await page.evaluate(async () => (await window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] })).violations.map((v) => `${v.id}(${v.impact}) x${v.nodes.length}: ${v.nodes[0].target.join(" ")}`));
  ok(r.length === 0, `axe ${label}: ${r.length ? r.join(" | ") : "no WCAG A/AA violations"}`);
}
const focusDesc = (p) => p.evaluate(() => { const e = document.activeElement; return e ? (e.getAttribute("aria-label") || e.textContent || e.tagName).trim().slice(0, 40) : ""; });
const inDialog = (p) => p.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'));
const scrollLocked = (p) => p.evaluate(() => getComputedStyle(document.body).overflow === "hidden");

for (const [label, ctxOpts] of [["phone", devices["iPhone 13"]], ["desktop", { viewport: { width: 1280, height: 900 } }]]) {
  const page = await (await b.newContext(ctxOpts)).newPage();
  await page.goto(`${BASE}/homes/736-myrtle/v2`); await page.waitForSelector("h1");
  await axe(page, `${label} page`);

  // Photo tour via keyboard from the counter button.
  await page.focus(".V-count"); await page.keyboard.press("Enter");
  await page.waitForSelector(".V-tour");
  ok(await inDialog(page), `${label}: focus moves into the photo tour`);
  ok(await scrollLocked(page), `${label}: page behind the tour can't scroll`);
  await axe(page, `${label} photo tour`);
  await page.keyboard.press("Shift+Tab");
  ok(await inDialog(page), `${label}: Shift+Tab stays inside the tour`);
  for (let i = 0; i < 30; i++) await page.keyboard.press("Tab");
  ok(await inDialog(page), `${label}: Tab x30 stays inside the tour`);
  await page.keyboard.press("Escape");
  ok(!(await page.locator(".V-tour").count()) && /Photo \d+ of 71/.test(await focusDesc(page)), `${label}: Escape closes the tour and focus returns to the photo counter (${await focusDesc(page)})`);

  // Map full screen.
  await page.focus(".V-expand"); await page.keyboard.press("Enter");
  await page.waitForSelector(".V-mapFull");
  ok(await inDialog(page), `${label}: focus moves into the full-screen map`);
  await axe(page, `${label} map`);
  await page.keyboard.press("Escape");
  ok(!(await page.locator(".V-mapFull").count()) && /map full screen/i.test(await focusDesc(page)), `${label}: Escape closes the map, focus back on its button`);

  // Dates + guests dialogs from the booking action.
  const cta = label === "phone" ? ".V-bar .V-cta" : ".V-card .V-cta";
  await page.focus(cta); await page.keyboard.press("Enter");
  await page.waitForSelector('[aria-label="Select dates"]');
  ok(await inDialog(page) && await scrollLocked(page), `${label}: dates dialog takes focus and locks the page`);
  await page.waitForSelector(".day:not([disabled])");
  await axe(page, `${label} dates dialog`);
  await page.keyboard.press("Escape");
  ok(/Check availability/.test(await focusDesc(page)), `${label}: focus returns to Check availability`);
  if (label === "desktop") {
    await page.focus(".V-card .V-field:nth-child(2)"); await page.keyboard.press("Enter");
    await page.waitForSelector('[aria-label="Guests"]');
    await axe(page, `${label} guests dialog`);
    await page.keyboard.press("Escape");
    ok(/Guests/.test(await focusDesc(page)), `${label}: focus returns to the Guests field`);
  }

  // Visible focus ring on a keyboard-focused control (move back one control from the booking button).
  await page.keyboard.press("Shift+Tab");
  const ring = await page.evaluate(() => { const s = getComputedStyle(document.activeElement); return s.outlineStyle !== "none" && parseFloat(s.outlineWidth) >= 2; });
  ok(ring, `${label}: keyboard focus is visible (2px outline)`);

  // Tap targets: WCAG 2.2 AA minimum 24x24 for every visible control.
  const small = await page.evaluate(() => [...document.querySelectorAll("a[href], button, [role=button], input, select, summary")]
    .filter((e) => { const r = e.getBoundingClientRect(); const st = getComputedStyle(e); return r.width > 0 && r.height > 0 && st.visibility !== "hidden" && !e.closest('[aria-hidden="true"]') && (r.width < 24 || r.height < 24); })
    .map((e) => `${(e.getAttribute("aria-label") || e.textContent).trim().slice(0, 25)} ${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`));
  ok(small.length === 0, `${label}: every control at least 24x24 px${small.length ? " — too small: " + small.join(", ") : ""}`);
}

// Checkout (from the 736 link): review + details steps.
const ck = await (await b.newContext(devices["iPhone 13"])).newPage();
await ck.goto(`${BASE}/?home=736&checkIn=2027-01-10&checkOut=2027-01-12&adults=2&children=1&infants=0`);
await ck.waitForSelector(".plan");
await axe(ck, "checkout review");
await ck.click("footer .btn"); await ck.waitForSelector("input");
await axe(ck, "checkout details");
await b.close();
console.log(process.exitCode ? "A11Y FAILED" : "A11Y PASSED");
