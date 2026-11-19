/**
 * Live vs test payments (Oscar, Nov 18-19). The test site (pearl-heights-checkout.vercel.app) and the real domain
 * (pearlheightshomes.com) are one Vercel project with one set of settings, so the mode is chosen per request:
 *  - pearlheightshomes.com (and www) is LIVE only when LIVE_CHECKOUT=on. Live uses STRIPE_LIVE_SECRET_KEY,
 *    STRIPE_LIVE_PUBLISHABLE_KEY and STRIPE_LIVE_WEBHOOK_SECRET.
 *  - Every other host keeps CHECKOUT_MODE (test: Stripe TEST keys STRIPE_SECRET_KEY / STRIPE_PUBLISHABLE_KEY).
 * Each quote remembers its mode (quotes.livemode), so a booking, its second charge, refunds, reconciliation, ID check
 * and agreement always use the same Stripe account mode the guest paid in.
 */
export const PUBLIC_HOSTS = new Set(["pearlheightshomes.com", "www.pearlheightshomes.com"]);
export type Mode = "mock" | "test" | "live";

export const liveSwitchOn = (env: NodeJS.ProcessEnv = process.env) => env.LIVE_CHECKOUT === "on";

export function hostOf(req: Request): string {
  return (req.headers.get("host") ?? new URL(req.url).host).toLowerCase().split(":")[0]!;
}

/** The checkout mode for a request's host. */
export function modeForHost(host: string, env: NodeJS.ProcessEnv = process.env): Mode {
  if (PUBLIC_HOSTS.has(host) && liveSwitchOn(env)) return "live";
  return (env.CHECKOUT_MODE as Mode) ?? "mock";
}

/**
 * The settings as one mode sees them: in live, the STRIPE_LIVE_* values take the place of the test Stripe settings and
 * CHECKOUT_MODE reads "live", so everything downstream that takes `env` works unchanged.
 */
export function envForMode(mode: Mode, env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  if (mode !== "live") return env;
  return {
    ...env,
    CHECKOUT_MODE: "live",
    STRIPE_SECRET_KEY: env.STRIPE_LIVE_SECRET_KEY ?? "",
    STRIPE_PUBLISHABLE_KEY: env.STRIPE_LIVE_PUBLISHABLE_KEY ?? "",
    STRIPE_WEBHOOK_SECRET: env.STRIPE_LIVE_WEBHOOK_SECRET ?? "",
  };
}

export function envForRequest(req: Request, env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return envForMode(modeForHost(hostOf(req), env), env);
}

/** Settings for a stored booking or quote (cron jobs, refunds, the stay page). */
export const envForLivemode = (livemode: boolean, env: NodeJS.ProcessEnv = process.env) => envForMode(livemode ? "live" : ((env.CHECKOUT_MODE as Mode) ?? "mock"), env);
