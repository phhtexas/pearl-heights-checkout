// Perplexity QA fixes (Nov 19): refresh during and after checkout, the 7-day split rule, the all-in price note,
// the stay page Payments card and the broken-link page.
// Run against a mock sandbox build: ALLOW_MOCK=true npx next start -p 3401 ; node e2e/refresh-safety.mjs http://localhost:3401
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("./_noBanner.cjs")(createRequire(import.meta.url)("playwright"));
const base = process.argv[2] ?? process.env.BASE_URL ?? "http://localhost:3401";
const ok = (c, m) => { console.log((c ? "ok  - " : "FAIL- ") + m); if (!c) process.exitCode = 1; };
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const checkouts = [];
page.on("request", (r) => { if (r.url().endsWith("/api/checkout")) checkouts.push(r.url()); });
const btn = () => page.locator("footer .btn");
const btnSays = (re) => page.waitForFunction((src) => { const b = document.querySelector("footer .btn"); return b && new RegExp(src).test(b.textContent); }, re.source, { timeout: 15000 });

// Central-time calendar day N days from now.
const dayPlus = (n) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date(Date.now() + n * 864e5));
const link = (inDays, nights = 3, home = "736") => `${base}/?home=${home}&checkIn=${dayPlus(inDays)}&checkOut=${dayPlus(inDays + nights)}&adults=2&children=0&infants=0`;

// 1) Split only when the balance date is at least 7 days after booking (check-in 37+ days out).
// The mock calendar has booked nights, so unavailable ranges are skipped (null).
async function splitOffered(inDays, home = "736") {
  await page.goto(link(inDays, 2, home));
  await page.waitForFunction(() => /\$/.test(document.querySelector(".ln.total")?.textContent ?? "") || /already booked|minimum/i.test(document.body.innerText), null, { timeout: 15000 });
  if (/already booked|minimum/i.test(await page.locator("body").innerText())) return null;
  return (await page.locator("text=now, the rest later").count()) > 0;
}
let checkedShort = 0;
for (const home of ["736", "752", "indianola", "claywell", "edgewood"]) for (let d = 31; d <= 36; d++) {
  const s = await splitOffered(d, home);
  if (s === null) continue;
  checkedShort++;
  ok(!s, `${home}, check-in ${d} days out: pay in full only (no same-week balance)`);
}
ok(checkedShort > 0, `at least one 31–36 day range was available to check (${checkedShort})`);
let longOk = null;
for (let d = 45; d <= 120 && longOk === null; d += 3) longOk = await splitOffered(d);
ok(longOk === true, "check-in 45+ days out: split offered");

// 2) All-in nightly price says what it includes.
ok((await page.locator(".inclNote").first().innerText()).includes("Includes cleaning and damage waiver"), "nightly price notes it includes cleaning and damage waiver");

// 3) Typed details survive a refresh on Your details and on Confirm and pay.
await btnSays(/Continue to your details/); await btn().click();
for (const [label, v] of [["First name", "Ana"], ["Last name", "Refresh"], ["Email", "ana@example.com"], ["Mobile phone", "2105550100"]]) await page.getByLabel(label).fill(v);
await page.waitForTimeout(300);
await page.reload();
await page.getByLabel("First name").waitFor({ timeout: 15000 });
ok(await page.getByLabel("First name").inputValue() === "Ana" && await page.getByLabel("Email").inputValue() === "ana@example.com", "refresh on Your details keeps the step and the typed details");
await page.evaluate(() => document.activeElement?.blur());
await btnSays(/Continue to payment/); await btn().click();
await page.locator('label.chk:has([data-consent])').waitFor();
await page.reload();
await page.locator('label.chk:has([data-consent])').waitFor({ timeout: 15000 });
ok(true, "refresh on Confirm and pay returns to Confirm and pay");
ok(!(await page.locator('label.chk:has([data-consent]) input').isChecked()), "the required agreement box must be ticked again after a refresh");
ok(!(await page.evaluate(() => JSON.stringify(sessionStorage)).then((t) => /4242|cvc|card/i.test(t))), "no card details in session storage");

// 4) Pay, then refresh: the same confirmation, never a new checkout.
await page.locator('label.chk:has([data-consent]) input[type="checkbox"]').check();
await btnSays(/Confirm and pay/); await btn().click();
await page.waitForSelector("text=You're booked", { timeout: 20000 });
const ref = (await page.locator(".miniBody .muted").first().innerText()).trim();
await page.reload();
await page.waitForSelector("text=You're booked", { timeout: 15000 });
ok((await page.locator(".miniBody .muted").first().innerText()).trim() === ref, `refresh after paying shows the same confirmation (${ref})`);
ok(await page.locator("text=Continue to your details").count() === 0 && await page.locator("text=Confirm and pay").count() === 0, "no checkout buttons after a refresh of a paid booking");
ok((await page.locator("text=Paid today").innerText()).includes("$"), "paid amount still shown");
ok(checkouts.length === 1, `exactly one checkout request (${checkouts.length})`);

// 5) Broken stay link: generic, token-free, with a way back.
const res = await page.goto(`${base}/stay/not-a-real-stay-link-qa-0000000000000000000`);
ok(res?.status() === 404, "unknown stay link is a 404");
ok(await page.locator("text=This link isn't working").count() === 1, "broken link page explains what happened");
ok(await page.locator('a[href="/contact"]').count() >= 1, "broken link page links to Contact");
ok(!(await page.locator("body").innerText()).includes("not-a-real-stay-link-qa"), "the link itself is not shown on the page");

// 6) Stay page Payments card (sample portal, sandbox builds only).
const demo = await page.goto(`${base}/stay/demo`);
if (demo?.status() === 200) {
  const card = page.locator('section[aria-labelledby="pay-h"]');
  await card.waitFor();
  const t = await card.innerText();
  ok(/First payment/.test(t) && /Second payment/.test(t) && /Total/.test(t), "stay page shows a Payments card with both payments and the total");
} else console.log("skip - /stay/demo not in this build (needs NEXT_PUBLIC_SANDBOX=true)");

// 7) Stripe's script blocked (ChatGPT GPT-F1): a clear message with Try again, no page crash.
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const q = await ctx.newPage();
  const errs = []; q.on("pageerror", (e) => errs.push(e.message));
  await q.route("**/api/config", (r) => r.fulfill({ json: { mode: "test", publishableKey: "pk_test_blocked" } }));
  await q.route("https://js.stripe.com/**", (r) => r.abort());
  let found = false;
  for (let d = 60; d < 200 && !found; d += 5) {
    await q.goto(link(d, 3, "752"));
    await q.waitForFunction(() => (/Continue to your details/.test(document.body.innerText) && /\$/.test(document.querySelector(".ln.total")?.textContent ?? "")) || /already booked/i.test(document.body.innerText), null, { timeout: 15000 });
    found = !/already booked/i.test(await q.locator("body").innerText());
  }
  await q.getByRole("button", { name: /Continue to your details/ }).first().click();
  for (const [l, v] of [["First name", "Qa"], ["Last name", "Blocked"], ["Email", "qa@example.com"], ["Mobile phone", "2105550100"]]) await q.getByLabel(l).fill(v);
  await q.getByRole("button", { name: /Continue to payment/ }).first().click();
  await q.locator("text=We couldn't load the secure payment form").waitFor({ timeout: 15000 });
  ok(true, "blocked Stripe: guest sees 'We couldn't load the secure payment form' with Try again");
  ok(await q.getByRole("button", { name: "Try again" }).count() === 1, "blocked Stripe: Try again button");
  ok(errs.length === 0, `blocked Stripe: no page errors (${errs.length})`);
  ok(!/Application error/.test(await q.locator("body").innerText()), "blocked Stripe: no Application error");
  await ctx.close();
}

await browser.close();
console.log(process.exitCode ? "REFRESH SAFETY FAILED" : "REFRESH SAFETY PASSED");
