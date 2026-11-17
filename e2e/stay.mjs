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
  ok(/Sandbox mode/.test(await page.locator(".ST-test").innerText()), `${tag}: labeled as sandbox`);
  ok(/Due by/.test(await page.locator(".ST-due").innerText()), `${tag}: shows the sign-and-verify deadline`);
  ok((await page.locator(".ST-steps .is-now").innerText()).includes("Confirm your reservation"), `${tag}: current step is Confirm your reservation`);
  const body = () => page.evaluate(() => document.body.innerText);
  ok(!/Test address/.test(await body()) && (await page.locator(".ST-lockNote").count()) === 1, `${tag}: arrival details locked before signing and verifying`);
  // sign: copy, name prefilled, button disabled until a name, "Not now" keeps the name
  await page.click("text=Review & sign");
  const panel = await page.locator(".ST-panel").innerText();
  ok(/covers your reservation details, house rules, and cancellation terms/.test(panel) && /Full legal name — exactly as it appears on your ID/.test(panel) && /Preview the full agreement/.test(panel), `${tag}: new agreement copy`);
  ok(/Sandbox mode — this test document isn't legally binding\./.test(panel), `${tag}: sandbox callout shows in a sandbox build`);
  ok((await page.locator(".ST-field input").inputValue()) === "Test Guest", `${tag}: name prefilled from the reservation`);
  await page.fill(".ST-field input", "   "); ok(await page.locator('.ST-panel button:has-text("Review & sign")').isDisabled(), `${tag}: Review & sign disabled with a blank name`);
  await page.fill(".ST-field input", "Oscar Pena"); ok(!(await page.locator('.ST-panel button:has-text("Review & sign")').isDisabled()), `${tag}: enabled right after a name is entered`);
  await page.click("text=Not now"); await page.click("text=Review & sign");
  ok((await page.locator(".ST-field input").inputValue()) === "Oscar Pena", `${tag}: Not now keeps the entered name`);
  // SignWell path (mocked here): the agreement opens INSIDE the portal; when SignWell reports "completed" the page
  // confirms with the server, then shows the signed state.
  await page.route("**/api/stay/demo/agreement", (r) => r.request().method() === "POST"
    ? r.fulfill({ json: { documentId: "a692e1ce-9929-4541-adc7-61932bab39d3", url: "https://www.signwell.com/docs/test/", testMode: true } }) : r.continue());
  let swSigned = false; // SignWell reports "Created" until the guest finishes
  await page.route("**/api/stay/demo/agreement?doc=*", (r) => r.fulfill({ json: swSigned ? { completed: true, status: "Completed", signedAt: "2026-11-17T22:30:00Z" } : { completed: false, status: "Created" } }));
  await page.route("https://static.signwell.com/assets/embedded.js", (r) => r.fulfill({ contentType: "text/javascript", body:
    "window.SignWellEmbed=function(o){this.open=function(){var c=document.getElementById(o.containerId);var f=document.createElement('iframe');f.title='SignWell';f.setAttribute('data-url',o.url);c.appendChild(f);window.__swDone=function(){o.events.completed({id:'x'})};};};" }));
  const before = page.url();
  await page.click('.ST-panel button:has-text("Review & sign")');
  await page.waitForSelector("#st-sign-frame.is-open iframe", { state: "attached", timeout: 8000 }).catch(() => {});
  ok(page.url() === before && (await page.locator("#st-sign-frame iframe").getAttribute("data-url")) === "https://www.signwell.com/docs/test/" && page.context().pages().length === 1, `${tag}: Review & sign opens the agreement inside the portal (no new tab)`);
  swSigned = true; await page.evaluate(() => window.__swDone());
  await page.waitForSelector(".ST-signed", { timeout: 8000 });
  ok((await page.locator(".ST-signedLine").innerText()) === "Agreement signed — November 17, 2026" && (await page.locator(".ST-task").first().evaluate((e) => e.classList.contains("is-done"))), `${tag}: confirmation with green check and the signed date`);
  ok((await page.locator(".ST-dl").getAttribute("href")) === "/api/stay/demo/agreement/pdf?doc=a692e1ce-9929-4541-adc7-61932bab39d3" && (await page.locator(".ST-dl").innerText()) === "Download a copy (PDF)", `${tag}: Download a copy (PDF) link`);
  ok(/1 of 2 done/.test(await page.locator(".ST-steps").innerText()), `${tag}: step indicator advances (1 of 2 done)`);
  await page.unroute("**/api/stay/demo/agreement"); await page.unroute("**/api/stay/demo/agreement?doc=*");
  // verify
  await page.click("text=Verify my ID"); await page.click("text=Simulate a successful check");
  ok(/Test address/.test(await body()) && /Arrives on check-in morning/.test(await body()) && (await page.locator(".ST-due").innerText()) === "All done", `${tag}: both done -> arrival details unlock; door code says check-in morning`);
  ok((await page.locator(".ST-steps .is-now").innerText()).includes("Get ready for arrival"), `${tag}: step moves to Get ready for arrival`);
  // persists on reload
  await page.reload(); await page.waitForTimeout(300);
  ok(/Test address/.test(await body()), `${tag}: progress kept on reload (this browser)`);
  // messages
  await page.fill("#st-msg", "What time is check-in?"); await page.click('.ST-send button');
  ok(/What time is check-in\?/.test(await page.locator(".ST-thread").innerText()) && /sandbox, not sent/.test(await page.locator(".ST-thread").innerText()), `${tag}: message shows in the thread, marked test`);
  ok((await page.locator(".ST-know").count()) >= 2 && /Quiet hours/.test(await page.locator(".ST-know").allTextContents().then((t) => t.join(" "))), `${tag}: house rules from the listing`);
  // reset
  await page.click("text=Reset sandbox");
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
