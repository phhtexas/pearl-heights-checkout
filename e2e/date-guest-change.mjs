// Browser test (ChatGPT note 135): changing dates/guests re-quotes, restarts the 15-minute lock, shows the total change,
// keeps guest details, unchecks the authorization, and the superseded quote can no longer be paid.
// Run against a mock server:  ALLOW_MOCK=true npx next start -p 3400  then  BASE_URL=http://localhost:3400 node e2e/date-guest-change.mjs
// Playwright is not a project dependency (keeps Vercel installs small); use a globally installed copy or `npm i -D playwright`.
import { createRequire } from "node:module";
const { chromium, devices } = createRequire(import.meta.url)("playwright");

const BASE = process.env.BASE_URL ?? "http://localhost:3400";
const fail = (m) => { console.error("FAIL:", m); process.exitCode = 1; };
const ok = (c, m) => (c ? console.log("ok  -", m) : fail(m));

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices["iPhone 13"] });
const page = await ctx.newPage();
const quotes = [];
page.on("response", async (r) => { if (r.url().endsWith("/api/quote") && r.ok()) quotes.push(await r.json()); });

await page.goto(`${BASE}/?home=claywell&checkIn=2027-01-05&checkOut=2027-01-07&adults=4`);
await page.waitForSelector(".plan");
const first = quotes.at(-1);
ok(first?.quote?.total > 0, "initial quote loaded");

// Enter details, tick the authorization on the pay step, then go back to review.
await page.click("footer .btn");
await page.fill('input[autocomplete="given-name"]', "Ana");
await page.fill('input[autocomplete="family-name"]', "Test");
await page.fill('input[type="email"]', "ana@example.com");
await page.fill('input[type="tel"]', "2105550100");
await page.click("footer .btn");
await page.check(".chk input");
ok(await page.isChecked(".chk input"), "authorization ticked on the pay step");
await page.click('button[aria-label="Back"] >> visible=true');
await page.click('button[aria-label="Back"] >> visible=true');
await page.waitForSelector(".plan");

// Wait a few seconds so a restarted timer is distinguishable, then add guests over the extra-guest threshold.
await page.waitForTimeout(3000);
const before = quotes.length;
await page.click('[aria-label="Change guests"]');
for (let i = 0; i < 3; i++) await page.click('[aria-label="More Adults"]');
await page.click("text=Save guests");
await page.waitForFunction((n) => window.__q === undefined && document.querySelector(".notice"), before, { timeout: 10000 }).catch(() => {});
await page.waitForTimeout(800);
const second = quotes.at(-1);
ok(quotes.length > before, "guest change triggered a new quote");
ok(second.quoteId !== first.quoteId, "new quote id");
ok(second.quote.total !== first.quote.total, `total changed (${first.quote.total} -> ${second.quote.total})`);
ok(second.expiresAt > first.expiresAt + 2000, "15-minute lock restarted");
const notice = await page.textContent(".notice").catch(() => "");
ok(/Your total changed from .* to .*/.test(notice ?? ""), "total-change notice shown");

// Guest details kept; authorization unchecked.
await page.click("footer .btn");
ok((await page.inputValue('input[autocomplete="given-name"]')) === "Ana", "guest details preserved");
await page.click("footer .btn");
ok(!(await page.isChecked(".chk input")), "authorization unchecked after the total changed");

// Change dates too: another new quote.
await page.click('button[aria-label="Back"] >> visible=true');
await page.click('button[aria-label="Back"] >> visible=true');
const n2 = quotes.length;
await page.click('[aria-label="Change dates"]');
await page.click('[aria-label^="Sun, Jan 10, 2027"]');
await page.click('[aria-label^="Tue, Jan 12, 2027"]');
await page.click("text=Save dates");
await page.waitForTimeout(1500);
ok(quotes.length > n2 && quotes.at(-1).quoteId !== second.quoteId, "date change triggered a new quote");

// The superseded quote cannot be paid for the new stay.
const third = quotes.at(-1);
const res = await page.evaluate(async ({ old, total }) => {
  const r = await fetch("/api/checkout", { method: "POST", body: JSON.stringify({ property: "claywell", checkIn: "2027-01-10", checkOut: "2027-01-12", adults: 7, children: 0, infants: 0,
    payPlan: "full", guest: { firstName: "Ana", lastName: "Test", email: "ana@example.com", phone: "2105550100" }, agreed: true, acceptedTotal: total, quoteId: old, attemptKey: crypto.randomUUID() }) });
  return { status: r.status, body: await r.json() };
}, { old: first.quoteId, total: third.quote.total });
ok(res.status === 400, `superseded quote rejected (${res.status}: ${res.body.error ?? res.body.guestMessage})`);

await browser.close();
console.log(process.exitCode ? "E2E FAILED" : "E2E PASSED");
