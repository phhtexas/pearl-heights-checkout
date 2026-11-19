import Stripe from "stripe";

/**
 * Stripe Identity (Oscar approved Nov 17, Sheet note 213). Document + selfie check of the reservation holder only.
 * Pricing (stripe.com/identity, read Nov 17, 2026): $1.50 per completed verification, first 50 free.
 *
 * Privacy notice §4: this app keeps only the outcome, timestamps and the session id, never ID images or extracted
 * fields. So we never expand `verified_outputs` or `last_verification_report`; we read the status alone.
 * Keys: TEST keys for test bookings; LIVE keys (from envForLivemode) only when env.CHECKOUT_MODE is "live".
 */
export class IdentityUnavailable extends Error { name = "IdentityUnavailable"; }

type IdentityLike = Pick<Stripe["identity"], "verificationSessions">;

export function identityClient(env: Record<string, string | undefined> = process.env): IdentityLike {
  const k = env.STRIPE_SECRET_KEY?.trim() ?? "";
  if (!k) throw new IdentityUnavailable("STRIPE_SECRET_KEY is not set");
  const live = env.CHECKOUT_MODE === "live";
  if (live ? !/^(sk|rk)_live_/.test(k) : !/^(sk|rk)_test_/.test(k)) throw new Error(`Identity needs a ${live ? "LIVE" : "TEST"} secret key for this booking.`);
  return new Stripe(k, { maxNetworkRetries: 2 }).identity;
}

export interface IdSession { id: string; clientSecret: string; url: string }
export type IdStatus = "verified" | "processing" | "requires_input" | "canceled";
export interface IdState { id: string; status: IdStatus; testMode: boolean; metadata: Record<string, string>; lastError?: string }

export async function createIdSession(o: { metadata: Record<string, string>; returnUrl: string }, client: IdentityLike = identityClient()): Promise<IdSession> {
  const s = await client.verificationSessions.create({
    type: "document",
    options: { document: { require_matching_selfie: true, require_live_capture: true } },
    metadata: o.metadata,
    return_url: o.returnUrl,
  });
  if (!s.id || !s.client_secret || !s.url) throw new Error("Stripe did not return a verification session");
  return { id: s.id, clientSecret: s.client_secret, url: s.url };
}

export async function getIdState(id: string, client: IdentityLike = identityClient()): Promise<IdState> {
  if (!/^vs_[A-Za-z0-9]{8,64}$/.test(id)) throw new Error("Bad verification session id");
  const s = await client.verificationSessions.retrieve(id);
  // last_error.code only (e.g. document_expired, selfie_face_mismatch): no personal data.
  return { id: s.id, status: s.status as IdStatus, testMode: !s.livemode, metadata: (s.metadata ?? {}) as Record<string, string>, ...(s.last_error?.code ? { lastError: s.last_error.code } : {}) };
}
