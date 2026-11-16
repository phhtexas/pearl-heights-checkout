// Note 150: arriving from a listing must never paint another home, an empty-dates state or the wrong photo.
// Records every DOM state from the first byte (MutationObserver installed before any page script), then checks it.
// Run against a mock server: BASE_URL=http://localhost:3401 node e2e/checkout-entry.mjs
import { createRequire } from "node:module";
const { chromium, devices } = createRequire(import.meta.url)("playwright");
const BASE = process.env.BASE_URL ?? "http://localhost:3401";
const ok = (c, m) => { console.log((c ? "ok  - " : "FAIL- ") + m); if (!c) process.exitCode = 1; };
const browser = await chromium.launch();

async function entry(label, ctxOpts, url, wrong) {
  const ctx = await browser.newContext(ctxOpts);
  await ctx.addInitScript((wrong) => {
    window.__seen = [];
    const scan = () => {
      const t = [...document.querySelectorAll("body > * :not(.testbar):not(.testbar *)")].length ? [...document.querySelectorAll(".top, .lock, .layout, .foot, .side, .scrim")].map((e) => e.innerText).join("\n") : "";
      for (const w of wrong.text) if (t.includes(w)) window.__seen.push("text:" + w);
      for (const img of document.images) for (const w of wrong.img) if ((img.currentSrc || img.src || "").includes(w)) window.__seen.push("img:" + w);
    };
    new MutationObserver(scan).observe(document, { subtree: true, childList: true, characterData: true, attributes: true });
    document.addEventListener("DOMContentLoaded", scan);
  }, wrong);
  const page = await ctx.newPage();
  await page.goto(url);
  await page.waitForSelector(".plan", { timeout: 15000 });
  const seen = [...new Set(await page.evaluate(() => window.__seen))];
  const final = await page.textContent(".homeCard, .sum");
  ok(seen.length === 0, `${label}: never showed ${wrong.text.concat(wrong.img).join(" / ")} (seen: ${seen.join(", ") || "none"})`);
  ok(final.includes(wrong.expect), `${label}: final card shows "${wrong.expect}"`);
  await ctx.close();
}
const w736 = { text: ["The Claywell", "Choose your dates", "Edgewood House", "613 Indianola", "752 Myrtle"], img: ["claywell.jpg"], expect: "Large Family House Next to the Pearl" };
await entry("phone 736", devices["iPhone 13"], `${BASE}/?home=736&checkIn=2027-01-10&checkOut=2027-01-12&adults=2&children=1&infants=0`, w736);
await entry("desktop 736", { viewport: { width: 1280, height: 900 } }, `${BASE}/?home=736&checkIn=2027-01-10&checkOut=2027-01-12&adults=2&children=1&infants=0`, w736);
// And from the listing page itself (Reserve click), phone.
{
  const ctx = await browser.newContext(devices["iPhone 13"]);
  await ctx.addInitScript(() => { window.__seen = []; const scan = () => { const t = [...document.querySelectorAll("body > * :not(.testbar):not(.testbar *)")].length ? [...document.querySelectorAll(".top, .lock, .layout, .foot, .side, .scrim")].map((e) => e.innerText).join("\n") : ""; if (location.search.includes("home=736")) { for (const w of ["The Claywell", "Choose your dates"]) if (t.includes(w)) window.__seen.push(w); for (const i of document.images) if ((i.currentSrc || i.src).includes("claywell.jpg")) window.__seen.push("claywell.jpg"); } }; new MutationObserver(scan).observe(document, { subtree: true, childList: true, characterData: true }); });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/homes/736-myrtle`);
  await page.click(".A-bar .A-cta");
  await page.waitForSelector(".day:not([disabled])");
  for (let i = 0; i < 6 && !(await page.locator('[aria-label^="Sun, Jan 10, 2027"]').count()); i++) await page.click('[aria-label="Next month"]');
  await page.click('[aria-label^="Sun, Jan 10, 2027"]'); await page.click('[aria-label^="Tue, Jan 12, 2027"]'); await page.click("text=Save dates");
  await page.waitForSelector(".A-bar b:has-text('total')");
  await page.click(".A-bar .A-cta");
  await page.waitForSelector(".plan", { timeout: 15000 });
  const seen = [...new Set(await page.evaluate(() => window.__seen))];
  ok(seen.length === 0, `listing → Reserve → checkout: no wrong home or empty dates on the way in (seen: ${seen.join(", ") || "none"})`);
  await ctx.close();
}
await browser.close();
console.log(process.exitCode ? "ENTRY E2E FAILED" : "ENTRY E2E PASSED");
