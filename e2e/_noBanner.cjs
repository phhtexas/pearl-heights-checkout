// E2E helper (Nov 18): pre-answers the cookie banner ("Decline") in every page, so it doesn't cover buttons under test.
// The banner itself is checked in e2e/tracking.mjs.
const INIT = () => { try { localStorage.setItem("ph-consent", JSON.stringify({ v: "denied", at: Date.now() })); } catch {} };
module.exports = (pw) => {
  const launch = pw.chromium.launch.bind(pw.chromium);
  const chromium = Object.create(pw.chromium);
  chromium.launch = async (...a) => {
    const b = await launch(...a);
    const newContext = b.newContext.bind(b);
    b.newContext = async (...c) => { const ctx = await newContext(...c); await ctx.addInitScript(INIT); return ctx; };
    b.newPage = async (...c) => { const ctx = await b.newContext(...c); const p = await ctx.newPage(); return p; };
    return b;
  };
  return { ...pw, chromium };
};
