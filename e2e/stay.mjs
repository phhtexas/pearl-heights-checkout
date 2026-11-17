// Guest portal phase 1 (test data): /stay/demo. Run against a mock server: BASE=http://localhost:3401 node e2e/stay.mjs
import { createRequire } from "node:module";
const { chromium, devices } = createRequire(import.meta.url)("playwright");
const BASE = process.env.BASE ?? "http://localhost:3401";
let fails = 0; const ok = (c, m) => { console.log(`${c ? "ok  " : "FAIL"}- ${m}`); if (!c) fails++; };
const browser = await chromium.launch();
for (const [tag, ctx] of [["phone", devices["iPhone 13"]], ["desktop", { viewport: { width: 1366, height: 900 } }]]) {
  const page = await (await browser.newContext({ ...ctx, reducedMotion: "reduce" })).newPage();
  const res = await page.goto(`${BASE}/stay/demo`);
  ok(res.status() === 200, `${tag}: /stay/demo loads`);
  ok(/noindex/.test(await page.locator('meta[name="robots"]').getAttribute("content") ?? ""), `${tag}: portal is noindex`);
  ok(/Test portal/.test(await page.locator(".ST-test").innerText()), `${tag}: labeled as a test portal`);
  ok(/Due by/.test(await page.locator(".ST-due").innerText()), `${tag}: shows the sign-and-verify deadline`);
  ok((await page.locator(".ST-steps .is-now").innerText()).includes("Confirm your reservation"), `${tag}: current step is Confirm your reservation`);
  const body = () => page.evaluate(() => document.body.innerText);
  ok(!/Test address/.test(await body()) && (await page.locator(".ST-lockNote").count()) === 1, `${tag}: arrival details locked before signing and verifying`);
  // sign
  await page.click("text=Review and sign");
  ok((await page.locator(".ST-field input").inputValue()) === "Test Guest", `${tag}: name prefilled from the reservation`);
  await page.fill(".ST-field input", ""); ok(await page.locator('button:has-text("Open agreement")').isDisabled(), `${tag}: agreement won't open without a full name`);
  await page.fill(".ST-field input", "Test Guest"); await page.click('button:has-text("Open agreement")');
  // No SignWell key on this local server -> the test-only fallback signing appears
  await page.waitForSelector(".ST-check input", { timeout: 8000 });
  ok(await page.locator('button:has-text("Sign agreement")').isDisabled(), `${tag}: (no SignWell key) fallback can't sign without agreeing`);
  await page.check(".ST-check input"); await page.fill(".ST-field input", "Test Guest");
  await page.click('button:has-text("Sign agreement")');
  ok(/Signed by Test Guest/.test(await body()) && !/Test address/.test(await body()), `${tag}: signed, still locked until ID check`);
  // verify
  await page.click("text=Verify my ID"); await page.click("text=Simulate a successful check");
  ok(/Test address/.test(await body()) && /Arrives on check-in morning/.test(await body()) && (await page.locator(".ST-due").innerText()) === "All done", `${tag}: both done -> arrival details unlock; door code says check-in morning`);
  ok((await page.locator(".ST-steps .is-now").innerText()).includes("Get ready for arrival"), `${tag}: step moves to Get ready for arrival`);
  // persists on reload
  await page.reload(); await page.waitForTimeout(300);
  ok(/Test address/.test(await body()), `${tag}: progress kept on reload (this browser)`);
  // messages
  await page.fill("#st-msg", "What time is check-in?"); await page.click('.ST-send button');
  ok(/What time is check-in\?/.test(await page.locator(".ST-thread").innerText()) && /test, not sent/.test(await page.locator(".ST-thread").innerText()), `${tag}: message shows in the thread, marked test`);
  ok((await page.locator(".ST-know").count()) >= 2 && /Quiet hours/.test(await page.locator(".ST-know").allTextContents().then((t) => t.join(" "))), `${tag}: house rules from the listing`);
  // reset
  await page.click("text=Reset test portal");
  ok(!/Test address/.test(await body()), `${tag}: reset locks it again`);
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${tag}: no sideways scroll`);
  if (process.env.AXE_PATH) {
    await page.addScriptTag({ path: process.env.AXE_PATH });
    const v = await page.evaluate(async () => (await axe.run(document, { runOnly: ["wcag2a", "wcag2aa"] })).violations.map((x) => x.id));
    ok(v.length === 0, `${tag}: accessibility scan clean ${v.join(",")}`);
  }
  await page.context().close();
}
{ const page = await (await browser.newContext()).newPage(); const r = await page.goto(`${BASE}/stay/not-a-real-token`); ok(r.status() === 404, "unknown portal link -> 404"); }
await browser.close();
console.log(fails ? `STAY E2E: ${fails} FAILED` : "STAY E2E PASSED"); process.exit(fails ? 1 : 0);
