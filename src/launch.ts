/**
 * Launch switch for page content (Oscar, Nov 19 launch check). NEXT_PUBLIC_LAUNCHED=on in Vercel (then redeploy) turns
 * the legal pages from "draft" into the final versions (no draft banner or label; attorney approved A1-A14) and replaces
 * the footer's "(coming soon)" Terms/Privacy with real links. Until then, everything stays as it is today.
 * Read at build time (NEXT_PUBLIC_), so it applies to server and browser code alike.
 */
export const LAUNCHED = process.env.NEXT_PUBLIC_LAUNCHED === "on";
