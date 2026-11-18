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
  ok(/^Hi Test! We're excited to host you\.$/.test(await page.locator("h1").innerText()), `${tag}: personal greeting with the guest's first name`);
  ok((await page.locator(".ST-steps .is-now").innerText()).includes("Complete paperwork"), `${tag}: current step is Complete paperwork`);
  ok(/You’re booked!|You're booked!/.test(await page.locator(".ST-booked").innerText()) && /completing ID verification/.test(await page.locator(".ST-booked").innerText()), `${tag}: "You're booked!" box`);
  const body = () => page.evaluate(() => document.body.innerText);
  ok(!/Test address/.test(await body()) && (await page.locator(".ST-lockNote").count()) === 1, `${tag}: arrival details locked before signing and verifying`);
  // sign: one tap; the name is edited inside the agreement, so no name field or "Fix it" link on the page
  const rows = await page.locator(".ST-pRow h3").allInnerTexts();
  ok(rows.join("|") === "Sign rental agreement|Verify your identity" && (await page.locator('.ST-pRow button:has-text("Sign agreement")').count()) === 1 && (await page.locator('.ST-pRow button:has-text("Verify identity")').count()) === 1, `${tag}: paperwork rows with their own buttons`);
  const flow = await page.locator(".ST-signFlow").first().innerText();
  ok((await page.locator(".ST-signFlow .ST-field").count()) === 0 && !/Fix it/.test(flow), `${tag}: one-tap step, no name field or Fix it link`);
  ok(/Sandbox mode — this test document isn't legally binding\./.test(flow), `${tag}: sandbox callout shows in a sandbox build`);
  // SignWell path (mocked here): the agreement opens INSIDE the portal; when SignWell reports "completed" the page
  // confirms with the server, then shows the signed state.
  await page.route("**/api/stay/demo/agreement", (r) => r.request().method() === "POST"
    ? r.fulfill({ json: { documentId: "a692e1ce-9929-4541-adc7-61932bab39d3", url: "https://www.signwell.com/docs/test/", testMode: true } }) : r.continue());
  let swSigned = false; // SignWell reports "Created" until the guest finishes
  await page.route("**/api/stay/demo/agreement?doc=*", (r) => r.fulfill({ json: swSigned ? { completed: true, status: "Completed", signedAt: "2026-11-17T22:30:00Z", legalName: "Oscar Pena", nameEdited: true } : { completed: false, status: "Created" } }));
  await page.route("https://static.signwell.com/assets/embedded.js", (r) => r.fulfill({ contentType: "text/javascript", body:
    "window.SignWellEmbed=function(o){this.open=function(){var c=document.getElementById(o.containerId);var f=document.createElement('iframe');f.title='SignWell';f.setAttribute('data-url',o.url);c.appendChild(f);window.__swDone=function(){o.events.completed({id:'x'})};};};" }));
  const before = page.url();
  await page.click('.ST-pRow button:has-text("Sign agreement")');
  await page.waitForSelector("#st-sign-frame.is-open iframe", { state: "attached", timeout: 8000 }).catch(() => {});
  ok(page.url() === before && (await page.locator("#st-sign-frame iframe").getAttribute("data-url")) === "https://www.signwell.com/docs/test/" && page.context().pages().length === 1, `${tag}: one tap opens the agreement inside the portal (no new tab)`);
  ok(/Check your name in the agreement, then sign\./.test(await page.locator(".ST-signFlow").first().innerText()), `${tag}: tells the guest to check their name in the agreement`);
  swSigned = true; await page.evaluate(() => window.__swDone());
  await page.waitForSelector(".ST-pRow.is-done", { timeout: 8000 });
  ok((await page.locator(".ST-signedLine").innerText()).startsWith("Agreement signed — November 17, 2026") && (await page.locator(".ST-task").first().evaluate((e) => e.classList.contains("is-done"))), `${tag}: confirmation with green check and the signed date`);
  ok((await page.locator(".ST-dl").getAttribute("href")) === "/api/stay/demo/agreement/pdf?doc=a692e1ce-9929-4541-adc7-61932bab39d3" && (await page.locator(".ST-dl").innerText()) === "Download a copy (PDF)", `${tag}: Download a copy (PDF) link`);
  ok(await page.evaluate(() => { const v = JSON.parse(localStorage.getItem("ph-stay-demo") || "{}"); return v.signedName === "Oscar Pena" && v.nameEdited === true; }), `${tag}: saves the name typed in the agreement and flags the change`);
  ok(/1 of 2 done/.test(await page.locator(".ST-steps").innerText()), `${tag}: step indicator advances (1 of 2 done)`);
  await page.unroute("**/api/stay/demo/agreement"); await page.unroute("**/api/stay/demo/agreement?doc=*");
  // verify (Stripe Identity, mocked): Stripe's window opens, then the page confirms with the server
  let idDone = false;
  await page.route("**/api/stay/demo/identity", (r) => r.request().method() === "POST" ? r.fulfill({ json: { sessionId: "vs_TEST1234567890", clientSecret: "vs_TEST_secret", url: "https://verify.stripe.com/start/test" } }) : r.continue());
  await page.route("**/api/stay/demo/identity?vs=*", (r) => r.fulfill({ json: { status: idDone ? "verified" : "requires_input" } }));
  await page.route("**/api/config", (r) => r.fulfill({ json: { mode: "test", publishableKey: "pk_test_x" } }));
  await page.route("https://js.stripe.com/**", (r) => r.fulfill({ contentType: "text/javascript", body: "window.Stripe=function(){return{verifyIdentity:function(c){window.__idSecret=c;window.__idCalls=(window.__idCalls||0)+1;return Promise.resolve(window.__idResult||{})}}};" }));
  ok(/Stripe test mode/.test(await page.locator(".ST-task").nth(1).innerText()), `${tag}: ID step labeled as Stripe test mode in the sandbox`);
  await page.evaluate(() => { window.__idResult = { error: { code: "session_cancelled" } }; });
  await page.click('.ST-pRow button:has-text("Verify identity")');
  await page.waitForSelector("text=Try again", { timeout: 8000 }).catch(() => {});
  ok(await page.evaluate(() => window.__idSecret === "vs_TEST_secret") && (await page.locator("text=Try again").count()) === 1, `${tag}: closing Stripe's window early offers Try again`);
  await page.evaluate(() => { window.__idResult = {}; }); idDone = true;
  await page.click("text=Try again");
  await page.waitForSelector("text=You're all set!", { timeout: 8000 }).catch(() => {});
  ok(/You're all set!/.test(await page.locator(".ST-booked").innerText()) && (await page.locator(".ST-pRow").count()) === 0, `${tag}: verified by Stripe -> "You're all set!", paperwork rows gone`);
  await page.unroute("**/api/stay/demo/identity"); await page.unroute("**/api/stay/demo/identity?vs=*");
  ok(/Test address/.test(await body()) && /Arrives on check-in morning/.test(await body()) && (await page.locator(".ST-goArrive").count()) === 1, `${tag}: both done -> arrival details unlock; door code says check-in morning`);
  ok(/^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=/.test(await page.locator(".ST-dir").getAttribute("href") ?? "") && (await page.locator(".ST-dir").getAttribute("target")) === "_blank", `${tag}: Get directions opens Google Maps directions`);
  ok((await page.locator(".ST-steps .is-now").innerText()).includes("Receive check-in details"), `${tag}: step moves to Receive check-in details`);
  // persists on reload
  await page.reload(); await page.waitForTimeout(300);
  ok(/Test address/.test(await body()), `${tag}: progress kept on reload (this browser)`);
  ok((await page.locator(".ST-paper").count()) === 0 && /Paperwork complete/.test(await page.locator(".ST-paperDone").innerText()), `${tag}: later visits: paperwork section gone, "Paperwork complete" line in the stay card`);
  // messages
  await page.fill("#st-msg", "What time is check-in?"); await page.click('.ST-send button');
  ok(/What time is check-in\?/.test(await page.locator(".ST-thread").innerText()) && /sandbox, not sent/.test(await page.locator(".ST-thread").innerText()), `${tag}: message shows in the thread, marked test`);
  ok((await page.locator(".ST-know").count()) >= 2 && /Quiet hours/.test(await page.locator(".ST-know").allTextContents().then((t) => t.join(" "))), `${tag}: house rules from the listing`);
  const guide = await page.locator(".ST-know summary").allInnerTexts();
  ok(/House guide/.test(await page.locator("#know-h").innerText()) && guide.includes("Washer and dryer") && guide.includes("Parking") && guide.at(-1) === "Safety and property", `${tag}: house guide with the 752 Guest Book topics`);
  await page.fill(".ST-gSearch input", "washer");
  const hits = await page.locator(".ST-know summary").allInnerTexts();
  ok(hits.includes("Washer and dryer") && !hits.includes("Parking") && (await page.locator(".ST-know mark").count()) > 0, `${tag}: guide search finds the washer and highlights it`);
  await page.fill(".ST-gSearch input", "zzzz");
  ok(/No results/.test(await page.locator(".ST-gCount").innerText()) && (await page.locator(".ST-know").count()) === 0, `${tag}: guide search shows no results`);
  await page.click(".ST-gClear");
  ok((await page.locator(".ST-know").count()) >= 8, `${tag}: clearing the search shows every topic again`);
  // reset
  await page.click("text=Reset sandbox");
  ok(!/Test address/.test(await body()), `${tag}: reset locks it again`);
  await page.click("text=Mark agreement signed"); await page.click("text=Mark ID verified"); await page.waitForTimeout(300);
  ok(/You're all set!/.test(await body()) && /Test address/.test(await body()), `${tag}: test controls walk the whole flow`);
  await page.click("text=Reset sandbox");
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
