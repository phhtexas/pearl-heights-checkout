// "Message Oscar & Fernanda" (Oscar, Nov 19): chat icon on the Hosted by row, button in Meet your hosts, header
// "Ask a question"; one form with dates prefilled when picked and optional otherwise.
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
const ciIn = dlg.getByLabel(/Check-in/), coIn = dlg.getByLabel(/Check-out/);
ok(await ciIn.inputValue() === "" && await coIn.inputValue() === "", "no dates picked: date fields empty");
ok((await dlg.innerText()).includes("(optional)"), "dates marked optional");
if (shots) await page.screenshot({ path: `${shots}/ask-nodates.png` });
await page.keyboard.press("Escape");
ok(await dlg.count() === 0, "Escape closes the form");

// Header "Ask a question" opens the same form.
await page.locator(".LN-ask:visible").first().click();
await dlg.waitFor();
ok(true, "header 'Ask a question' opens the form");
// Guest picks dates in the form, then sends.
const a = dayPlus(60), b = dayPlus(63);
await ciIn.fill(a); await coIn.fill(b);
await dlg.getByLabel("Your name").fill("Jamie Rivera");
await dlg.getByLabel("Email").fill("jamie@example.com");
await dlg.getByLabel("Message").fill("Is the crib available?");
await dlg.getByRole("button", { name: "Send message" }).click();
await dlg.getByText("Message sent").waitFor();
ok(posted?.checkIn === a && posted?.checkOut === b && posted?.property === "752" && posted?.quotedTotal === null, "dates chosen in the form are sent (no page total)");
ok(await dlg.getByRole("link", { name: "Open your conversation" }).getAttribute("href") === "/m/sample-private-link-0000000000000", "success shows the private conversation link");
if (shots) await page.screenshot({ path: `${shots}/ask-sent.png` });
await dlg.getByRole("button", { name: "Back to the home" }).click();

// Dates picked on the page: the form opens with them filled in, plus the total.
await page.goto(`${base}/homes/752-myrtle?checkIn=${dayPlus(90)}&checkOut=${dayPlus(93)}&adults=2&children=1`);
await page.waitForFunction(() => /\$[\d,]+/.test(document.querySelector(".V-bar")?.textContent ?? "") || /already booked|Minimum/i.test(document.body.innerText), null, { timeout: 20000 });
const priced = /\$[\d,]+/.test(await page.locator(".V-bar").innerText());
await page.locator(".V-host .V-msgIcon").click();
await dlg.waitFor();
ok(await ciIn.inputValue() === dayPlus(90) && await coIn.inputValue() === dayPlus(93), "dates picked on the page are prefilled");
ok(await dlg.getByLabel("Children").inputValue() === "1", "guests prefilled");
ok(!priced || /total for 3 guests/.test(await dlg.innerText()), "the page's total shows when dates are prefilled");
if (shots) await page.screenshot({ path: `${shots}/ask-dates.png` });
// Half a range is caught.
await coIn.fill("");
await dlg.getByLabel("Your name").fill("Jamie"); await dlg.getByLabel("Email").fill("j@example.com"); await dlg.getByLabel("Message").fill("Hi");
await dlg.getByRole("button", { name: "Send message" }).click();
ok(/Add a check-out date, or clear the dates/.test(await dlg.locator(".AH-err").innerText()), "half a date range asks for check-out or clearing");
await dlg.getByRole("button", { name: "Clear dates" }).click();
ok(await ciIn.inputValue() === "", "Clear dates empties both");
ok(errs.length === 0, `no page errors (${errs.join(" | ")})`);
await browser.close();
console.log(process.exitCode ? "ASK HOSTS FAILED" : "ASK HOSTS PASSED");
