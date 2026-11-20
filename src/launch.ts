/**
 * Launch switch for page content. Since Oscar, Nov 20 ("publish all legal pages"; attorney approved, Twilio toll-free
 * review), the legal pages are final (no draft banner or label) and the footer's Terms/Privacy are real links.
 * NEXT_PUBLIC_LAUNCHED=off in Vercel (then redeploy) would put the draft labels back.
 * Read at build time (NEXT_PUBLIC_), so it applies to server and browser code alike.
 */
export const LAUNCHED = process.env.NEXT_PUBLIC_LAUNCHED !== "off";
