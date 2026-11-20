// "Message Oscar & Fernanda" (Oscar, Nov 19): chat icon on the Hosted by row, button in Meet your hosts, header
// "Ask a question". Two versions of the form: dates already picked -> a summary card; no dates -> optional date fields
// that open the homepage calendar, plus guests.
// Run against a mock build: ALLOW_MOCK=true npx next start -p 3401 ; node e2e/ask-hosts.mjs http://localhost:3401
// /api/inquiries is stubbed here (no database locally); the server side is covered by test/inquiries.test.ts.
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("./_noBanner.cjs")(createRequire(import.meta.url)("playwright"));
const base = process.argv[2] ?? process.env.BASE_URL ?? "http://localhost:3401";
const shots = process.argv[3];
const ok = (c, m) => { console.log((c ? "ok  - " : "FAIL- ") + m); if (!c) process.exitCode = 1; };
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errs = []; page.on("pageerror", (e) => errs.push(e.message));
let posted = null;
await page.route("**/api/inquiries", async (r) => { posted = r.request().postDataJSON(); await r.fulfill({ json: { ok: true, url: "/m/sample-private-link-0000000000000", emailed: false } }); });
const dayPlus = (n) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date(Date.now() + n * 864e5));

await page.goto(`${base}/homes/752-myrtle`);
const icon = page.locator(".V-host .V-msgIcon");
ok(await icon.count() === 1, "chat icon on the 'Hosted by' row");
ok((await icon.getAttribute("aria-label")) === "Message Oscar & Fernanda", "icon has a name for screen readers");
const btn = page.locator("#hosts .V-msgBtn");
ok(await btn.count() === 1 && /Message Oscar & Fernanda/.test(await btn.innerText()), "'Message Oscar & Fernanda' button in Meet your hosts");
ok(await page.locator('#hosts a[href^="mailto:"]').count() === 0, "the old email link is gone from Meet your hosts");
ok(/usually reply within an hour/i.test(await page.locator("#hosts .V-msgNote").innerText()), "note under the button");

// No dates picked: the form opens with empty, optional dates.
await icon.click();
const dlg = page.getByRole("dialog", { name: "Message Oscar & Fernanda" });
await dlg.waitFor();
ok(/Usually reply within an hour/.test(await dlg.innerText()), "form says 'Usually reply within an hour' under the title");
const ciBtn = dlg.getByRole("button", { name: /Check-in date/ }), coBtn = dlg.getByRole("button", { name: /Check-out date/ });
ok(/add date/.test(await ciBtn.getAttribute("aria-label")) && /add date/.test(await coBtn.getAttribute("aria-label")), "no dates picked: date fields say Add dates");
ok((await dlg.innerText()).includes("Dates are optional"), "dates marked optional");
await dlg.getByRole("button", { name: /Guests/ }).click();
await dlg.getByRole("button", { name: "More children" }).click();
ok(/3 guests/.test(await dlg.locator("#ah-g-val").innerText()), "guests popover with +/- like the homepage");
await page.keyboard.press("Escape");
ok(await dlg.count() === 1 && await dlg.getByRole("group", { name: "Guests" }).count() === 0, "Escape closes the guests popover first");
if (shots) await page.screenshot({ path: `${shots}/ask-nodates.png` });
await page.keyboard.press("Escape");
ok(await dlg.count() === 0, "Escape closes the form");

// Header "Ask a question" opens the same form; the guest picks dates with the homepage calendar.
await page.locator(".LN-ask:visible").first().click();
await dlg.waitFor();
ok(true, "header 'Ask a question' opens the form");
await ciBtn.click();
const cal = page.getByRole("dialog", { name: "Choose your dates" });
await cal.waitFor();
ok(await page.locator(".DR-sheet").count() === 1, "phone: the homepage's full-screen calendar opens");
if (shots) await page.screenshot({ path: `${shots}/ask-calendar.png` });
const a = dayPlus(60), b = dayPlus(63);
await cal.locator(`.DR-day[data-date="${a}"]`).click();
await cal.locator(`.DR-day[data-date="${b}"]`).click();
await cal.getByRole("button", { name: "Select dates" }).click();
ok(await cal.count() === 0 && await dlg.count() === 1, "Select dates closes the calendar and keeps the form open");
ok(/add date/.test(await ciBtn.getAttribute("aria-label")) === false, "chosen dates show in the form");
await dlg.getByLabel("Your name").fill("Jamie Rivera");
await dlg.getByLabel("Email").fill("jamie@example.com");
await dlg.getByLabel("Message").fill("Is the crib available?");
if (shots) await page.screenshot({ path: `${shots}/ask-chosen.png` });
await dlg.getByRole("button", { name: "Send message" }).click();
await dlg.getByText("Message sent").waitFor();
ok(posted?.checkIn === a && posted?.checkOut === b && posted?.property === "752" && posted?.quotedTotal === null, "dates chosen in the form are sent (no page total)");
ok(await dlg.getByRole("link", { name: "Open your conversation" }).getAttribute("href") === "/m/sample-private-link-0000000000000", "success shows the private conversation link");
if (shots) await page.screenshot({ path: `${shots}/ask-sent.png` });
await dlg.getByRole("button", { name: "Back to the home" }).click();

// Dates picked on the page: a summary card (home, dates · guests, total) instead of fields.
await page.goto(`${base}/homes/752-myrtle?checkIn=${dayPlus(90)}&checkOut=${dayPlus(93)}&adults=2&children=1`);
await page.waitForFunction(() => /\$[\d,]+/.test(document.querySelector(".V-bar")?.textContent ?? "") || /already booked|Minimum/i.test(document.body.innerText), null, { timeout: 20000 });
const priced = /\$[\d,]+/.test(await page.locator(".V-bar").innerText());
await page.locator(".V-host .V-msgIcon").click();
await dlg.waitFor();
const sum = await dlg.locator(".AH-sum").innerText();
ok(/· 3 guests/.test(sum), `summary card shows dates and guests (${sum.replace(/\n/g, " | ")})`);
ok(!priced || /\$[\d,.]+ total/.test(sum), "summary card shows the total");
ok(await dlg.getByRole("button", { name: /Check-in date/ }).count() === 0, "no date fields when dates are already picked");
// Edit: switches to the homepage-style box with the same dates and guests, ready to change.
await dlg.getByRole("button", { name: "Edit dates and guests" }).click();
ok(await dlg.locator(".AH-sum").count() === 0 && /add date/.test(await dlg.getByRole("button", { name: /Check-in date/ }).getAttribute("aria-label")) === false, "Edit shows the date fields with the picked dates");
ok(/3 guests/.test(await dlg.locator("#ah-g-val").innerText()), "Edit keeps the guests");
if (shots) await page.screenshot({ path: `${shots}/ask-edit.png` });
await dlg.getByRole("button", { name: /Guests/ }).click();
await dlg.getByRole("button", { name: "More adults" }).click();
await dlg.getByRole("button", { name: "Done" }).click();
await dlg.getByLabel("Message").fill("Any discount for 4?");
posted = null;
await dlg.getByRole("button", { name: "Send message" }).click();
await dlg.getByText("Message sent").waitFor();
ok(posted?.adults === 3 && posted?.checkIn === dayPlus(90) && posted?.quotedTotal === null, "edited guests are sent; the old total isn't");
await dlg.getByRole("button", { name: "Back to the home" }).click();
await page.locator(".V-host .V-msgIcon").click();
await dlg.waitFor();
await dlg.getByLabel("Message").fill("Any discount?");
posted = null;
await dlg.getByRole("button", { name: "Send message" }).click();
await dlg.getByText("Message sent").waitFor();
ok(posted?.checkIn === dayPlus(90) && posted?.children === 1 && (!priced || posted?.quotedTotal > 0), "the page's dates, guests and total are sent");
ok(errs.length === 0, `no page errors (${errs.join(" | ")})`);
await browser.close();
console.log(process.exitCode ? "ASK HOSTS FAILED" : "ASK HOSTS PASSED");
