// Guest flow through Checkout E (mock mode, local): pick dates, see total, fill details, accept, pay (double-click),
// confirmation. Double-clicking Pay must send exactly one checkout request.
// Run: ALLOW_MOCK=true npx next start -p 3401 ; node e2e/full-flow.mjs http://localhost:3401
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
const base = process.argv[2] ?? process.env.BASE_URL ?? "http://localhost:3401";
const ok = (c, m) => { console.log((c ? "ok  - " : "FAIL- ") + m); if (!c) process.exitCode = 1; };
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const checkouts = [];
page.on("request", (r) => { if (r.url().endsWith("/api/checkout")) checkouts.push(JSON.parse(r.postData())); });
await page.goto(`${base}/?home=indianola`);
// No dates in the link: the date sheet opens first.
await page.waitForSelector('[aria-label="Change dates"]');
await page.getByLabel("Next month").click();
await page.waitForFunction(() => [...document.querySelectorAll("button.day small")].some((s) => s.textContent));
await page.locator("button.day:not([disabled]):has(small:not(:empty))").first().click(); // check-in
await page.locator("button.day.sel ~ button.day:not([disabled])").first().click();      // first valid check-out after it
await page.getByRole("button", { name: "Save dates" }).click();
const next = page.locator("footer .btn");
await page.waitForFunction(() => { const b = document.querySelector("footer .btn"); return b && !b.disabled && /Continue to your details/.test(b.textContent); });
ok((await page.locator(".ln.total").first().innerText()).includes("$"), "total shown on the review step");
await next.click();
for (const [label, v] of [["First name", "Test"], ["Last name", "Guest"], ["Email", "test@example.com"], ["Mobile phone", "2105550100"]]) await page.getByLabel(label).fill(v);
await page.evaluate(() => document.activeElement?.blur()); // keyboard closed (the bottom bar hides while typing)
await next.click(); // Continue to payment
// Optional marketing boxes: present, separate, unchecked; the text names the number the texts would go to.
ok(await page.locator('[data-optin] input').count() === 2, "two optional marketing boxes");
ok(!(await page.locator('[data-optin="email"] input').isChecked()) && !(await page.locator('[data-optin="sms"] input').isChecked()), "marketing boxes start unchecked");
ok((await page.locator('[data-optin="sms"]').innerText()).includes("Pearl Heights Homes at 2105550100"), "text-message box names the mobile number");
ok(/Reply STOP to opt out and HELP for help/.test(await page.locator('[data-optin="sms"]').innerText()), "text-message box shows STOP/HELP");
ok(await page.locator("footer .btn").isDisabled(), "Pay stays off until the required box is checked (marketing boxes don't count)");
await page.locator('label.chk:has([data-consent]) input[type="checkbox"]').check();
await page.waitForFunction(() => /Confirm and pay/.test(document.querySelector("footer .btn")?.textContent ?? ""));
await next.dblclick();
await page.waitForSelector("text=You're booked", { timeout: 20000 });
ok(checkouts.length === 1, `double-click Pay sent exactly one checkout request (${checkouts.length})`);
ok(checkouts.every((c) => /^[0-9a-f-]{36}$/.test(c.quoteId)), "checkout request carries the saved quote id");
ok(checkouts[0]?.property === "indianola" && checkouts[0]?.agreed === true, "request is for the chosen home with the agreement accepted");
ok(checkouts[0]?.consentId === "checkout-1.2" && checkouts[0]?.marketingEmail === false && checkouts[0]?.marketingSms === false, "request carries the consent id and no marketing opt-in by default");
await browser.close();
console.log(process.exitCode ? "FULL FLOW FAILED" : "FULL FLOW PASSED");
