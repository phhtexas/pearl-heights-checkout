// Note 144: the listing → Checkout E hand-off keeps adults, children and infants separately.
// Run against a mock server: BASE_URL=http://localhost:3401 node e2e/listing-handoff.mjs
import { createRequire } from "node:module";
const { chromium, devices } = createRequire(import.meta.url)("playwright");
const BASE = process.env.BASE_URL ?? "http://localhost:3401";
const ok = (c, m) => { console.log((c ? "ok  - " : "FAIL- ") + m); if (!c) process.exitCode = 1; };
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices["iPhone 13"] });
const page = await ctx.newPage();
const quotes = [];
page.on("response", async (r) => { if (r.url().endsWith("/api/quote") && r.request().method() === "POST") quotes.push({ req: JSON.parse(r.request().postData() || "{}"), status: r.status(), body: await r.json().catch(() => ({})) }); });

await page.goto(`${BASE}/homes/736-myrtle`);
await page.click(".V-bar .V-cta");
await page.waitForSelector(".day:not([disabled])");
for (let i = 0; i < 6 && !(await page.locator('[aria-label^="Sun, Jan 10, 2027"]:visible').count()); i++) await page.click('[aria-label="Next month"]');
await page.click('[aria-label^="Sun, Jan 10, 2027"]:visible');
await page.click('[aria-label^="Tue, Jan 12, 2027"]:visible');
await page.click("text=Save dates");
await page.waitForSelector(".V-bar b:has-text('total')");
// 4 adults + 2 children + 1 infant
await page.click(".V-barLinks button:nth-of-type(2)");
for (let i = 0; i < 2; i++) await page.click('[aria-label="More Adults"]');
for (let i = 0; i < 2; i++) await page.click('[aria-label="More Children"]');
await page.click('[aria-label="More Infants"]');
await page.click("text=Save guests");
await page.waitForFunction(() => document.querySelector(".V-barLinks")?.textContent?.includes("6 guests"));
await page.waitForSelector(".V-bar b:has-text('total')");
await page.waitForTimeout(500);
const listingQuote = quotes.at(-1);
ok(listingQuote.req.adults === 4 && listingQuote.req.children === 2 && listingQuote.req.infants === 1, "listing quote used 4/2/1");
const listingTotal = listingQuote.body.quote.total;

await page.click(".V-bar .V-cta");
await page.waitForURL(/\?home=736/);
ok(page.url().includes("adults=4&children=2&infants=1"), "hand-off URL carries adults=4&children=2&infants=1");
await page.waitForSelector(".plan");
const ck = quotes.at(-1);
ok(ck.req.adults === 4 && ck.req.children === 2 && ck.req.infants === 1, "checkout's fresh quote used exactly 4/2/1");
ok(ck.body.quote.total === listingTotal, `checkout total equals listing total (${ck.body.quote.total} = ${listingTotal})`);
ok((await page.textContent(".homeCard")).includes("6 guests, 1 infant"), "checkout shows '6 guests, 1 infant'");

// Back navigation keeps the mix.
await page.click("footer .btn");
await page.click('button[aria-label="Back"] >> visible=true');
await page.waitForSelector(".plan");
ok((await page.textContent(".homeCard")).includes("6 guests, 1 infant"), "after details → back: still 6 guests, 1 infant");
// Guest sheet shows the three categories.
await page.click('[aria-label="Change guests"]');
const vals = await page.$$eval(".stepper b", (els) => els.map((e) => e.textContent));
ok(JSON.stringify(vals) === JSON.stringify(["4", "2", "1"]), `guest sheet shows adults 4, children 2, infants 1 (${vals})`);
// Edit: one more child → re-quote with 4/3/1.
await page.click('[aria-label="More Children"]');
await page.click("text=Save guests");
await page.waitForFunction(() => document.querySelector(".homeCard")?.textContent?.includes("7 guests, 1 infant"));
await page.waitForTimeout(800);
const ed = quotes.at(-1);
ok(ed.req.adults === 4 && ed.req.children === 3 && ed.req.infants === 1, "guest edit re-quotes with 4/3/1");

// Capacity: 9 adults + 2 children (11 > 10) is refused by the server; infants don't count (10 + 3 infants is fine).
const over = await page.evaluate(async () => (await fetch("/api/quote", { method: "POST", body: JSON.stringify({ property: "736", checkIn: "2027-01-10", checkOut: "2027-01-12", adults: 9, children: 2, infants: 0 }) })).status);
ok(over === 400, `11 guests refused by server (status ${over})`);
const inf = await page.evaluate(async () => (await fetch("/api/quote", { method: "POST", body: JSON.stringify({ property: "736", checkIn: "2027-01-10", checkOut: "2027-01-12", adults: 8, children: 2, infants: 3 }) })).status);
ok(inf === 200, `10 guests + 3 infants accepted (infants don't count) (status ${inf})`);
const p2 = await ctx.newPage();
await p2.goto(`${BASE}/?home=736&checkIn=2027-01-10&checkOut=2027-01-12&adults=9&children=2&infants=0`);
await p2.waitForSelector(".err, .plan", { timeout: 10000 });
ok(await p2.locator(".err").count() > 0, "checkout opened with 11 guests shows an error, not a price");

await browser.close();
console.log(process.exitCode ? "HANDOFF E2E FAILED" : "HANDOFF E2E PASSED");
