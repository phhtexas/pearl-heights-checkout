import Stripe from "stripe";
import { AdapterError, PaymentsAdapter } from "./types";

/**
 * Real Stripe adapter. Authorize = PaymentIntent with manual capture, confirmed on the server with the
 * PaymentMethod the browser created. Capture happens only after Hospitable confirms the reservation.
 *
 * Guard: in CHECKOUT_MODE=test the keys must be test keys (sk_test_/pk_test_); a live key refuses to start.
 * Not yet handled (gate before live): 3-D Secure "requires_action" (returned as card_declined with a clear code),
 * webhooks, and DB-backed idempotency.
 */
export function assertTestKeys(env: NodeJS.ProcessEnv): { secret: string; publishable: string } {
  const secret = env.STRIPE_SECRET_KEY ?? "", publishable = env.STRIPE_PUBLISHABLE_KEY ?? "";
  if (!secret.startsWith("sk_test_") && !secret.startsWith("rk_test_")) throw new Error("Test mode needs a Stripe TEST secret key (sk_test_). Refusing to start.");
  if (!publishable.startsWith("pk_test_")) throw new Error("Test mode needs a Stripe TEST publishable key (pk_test_). Refusing to start.");
  return { secret, publishable };
}

export const ACCEPTED_PM_TYPES: string[] = ["card", "link"];

type StripeLike = Pick<Stripe, "paymentIntents" | "customers" | "paymentMethods">;

export class StripePayments implements PaymentsAdapter {
  constructor(private stripe: StripeLike) {}

  static fromEnv(env: NodeJS.ProcessEnv): StripePayments {
    const { secret } = assertTestKeys(env);
    return new StripePayments(new Stripe(secret, { maxNetworkRetries: 2 }));
  }

  async authorize(i: Parameters<PaymentsAdapter["authorize"]>[0]) {
    if (!i.paymentMethodId) throw new AdapterError("No card details were provided.", "card_declined");
    try {
      // Cards plus Link (Oscar, Nov 17: Apple Pay, Google Pay and Link). Apple Pay and Google Pay arrive as type "card";
      // Link is type "link". Both support manual capture and saving for the split-payment second charge.
      // Everything else (bank debits, pay-later, etc.) is rejected before charging (ChatGPT note 76).
      const pm = await this.stripe.paymentMethods.retrieve(i.paymentMethodId);
      if (!ACCEPTED_PM_TYPES.includes(pm.type)) throw new AdapterError(`Payment method type ${pm.type} is not accepted`, "unsupported_method");
      let customer: string | undefined;
      if (i.savePaymentMethod && i.customer) {
        const c = await this.stripe.customers.create(
          { name: i.customer.name, email: i.customer.email, phone: i.customer.phone, metadata: i.metadata },
          { idempotencyKey: `${i.idempotencyKey}:customer` },
        );
        customer = c.id;
      }
      const pi = await this.stripe.paymentIntents.create({
        amount: i.amount, currency: "usd", capture_method: "manual", confirm: true,
        payment_method: i.paymentMethodId, allowed_payment_method_types: [pm.type],
        description: i.description, metadata: i.metadata,
        ...(customer ? { customer, setup_future_usage: "off_session" as const } : {}),
      }, { idempotencyKey: i.idempotencyKey });
      if (pi.status === "requires_action") {
        await this.stripe.paymentIntents.cancel(pi.id).catch(() => undefined);
        throw new AdapterError("Card requires authentication (3-D Secure), not supported yet", "authentication_required");
      }
      if (pi.status !== "requires_capture") throw new AdapterError(`Unexpected payment status ${pi.status}`, "card_declined");
      return { paymentIntentId: pi.id };
    } catch (e) {
      if (e instanceof AdapterError) throw e;
      const err = e as { type?: string; message?: string; code?: string; payment_intent?: { id?: string; status?: string } };
      if (err.code === "authentication_required" || err.code === "payment_intent_authentication_failure") {
        if (err.payment_intent?.id) await this.stripe.paymentIntents.cancel(err.payment_intent.id).catch(() => undefined);
        throw new AdapterError("Card requires authentication (3-D Secure), not supported yet", "authentication_required");
      }
      if (err.type === "StripeCardError") throw new AdapterError(err.message ?? "Card declined", "card_declined");
      throw new AdapterError("Payment service error", "upstream_error");
    }
  }

  async capture(id: string) {
    try {
      const pi = await this.stripe.paymentIntents.capture(id, {}, { idempotencyKey: `${id}:capture` });
      if (pi.status !== "succeeded") throw new AdapterError(`Capture ended in ${pi.status}`, "capture_failed");
    } catch (e) {
      if (e instanceof AdapterError) throw e;
      throw new AdapterError("Capture failed", "capture_failed");
    }
  }

  async status(id: string) {
    const pi = await this.stripe.paymentIntents.retrieve(id);
    if (pi.status === "succeeded") return "captured" as const;
    if (pi.status === "requires_capture") return "authorized" as const;
    if (pi.status === "canceled") return "voided" as const;
    return "failed" as const;
  }

  /** Stripe search on metadata.booking_ref (eventually consistent, ~1 min); fine for reconciliation. */
  async findByRef(ref: string) {
    if (!/^PH-[A-Z0-9]{6}$/.test(ref)) throw new AdapterError("bad ref", "bad_request");
    const r = await this.stripe.paymentIntents.search({ query: `metadata['booking_ref']:'${ref}'` });
    return r.data.map((p) => p.id);
  }

  async savedMethod(id: string) {
    const pi = await this.stripe.paymentIntents.retrieve(id);
    const customerId = typeof pi.customer === "string" ? pi.customer : pi.customer?.id;
    const paymentMethodId = typeof pi.payment_method === "string" ? pi.payment_method : pi.payment_method?.id;
    return customerId && paymentMethodId ? { customerId, paymentMethodId } : null;
  }

  async chargeSaved(i: { customerId: string; paymentMethodId: string; amount: number; idempotencyKey: string; description: string; metadata: Record<string, string> }) {
    try {
      const pi = await this.stripe.paymentIntents.create({
        amount: i.amount, currency: "usd", customer: i.customerId, payment_method: i.paymentMethodId,
        off_session: true, confirm: true, allowed_payment_method_types: [...ACCEPTED_PM_TYPES], description: i.description, metadata: i.metadata,
      }, { idempotencyKey: i.idempotencyKey });
      if (pi.status === "succeeded") return { paymentIntentId: pi.id, status: "succeeded" as const };
      if (pi.status === "requires_action") throw new AdapterError("Card requires authentication", "authentication_required");
      throw new AdapterError(`Unexpected status ${pi.status}`, "upstream_error");
    } catch (e) {
      if (e instanceof AdapterError) throw e;
      const err = e as { type?: string; code?: string };
      if (err.code === "authentication_required") throw new AdapterError("Card requires authentication", "authentication_required");
      if (err.type === "StripeCardError") throw new AdapterError("Card declined", "card_declined");
      throw new AdapterError("Payment service error", "upstream_error");
    }
  }

  async voidAuthorization(id: string) {
    const pi = await this.stripe.paymentIntents.retrieve(id);
    if (pi.status === "requires_capture" || pi.status === "requires_payment_method" || pi.status === "requires_confirmation") {
      await this.stripe.paymentIntents.cancel(id, {}, { idempotencyKey: `${id}:cancel` });
    }
  }
}
