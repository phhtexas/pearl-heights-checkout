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

type StripeLike = Pick<Stripe, "paymentIntents" | "customers">;

export class StripePayments implements PaymentsAdapter {
  constructor(private stripe: StripeLike) {}

  static fromEnv(env: NodeJS.ProcessEnv): StripePayments {
    const { secret } = assertTestKeys(env);
    return new StripePayments(new Stripe(secret, { maxNetworkRetries: 2 }));
  }

  async authorize(i: Parameters<PaymentsAdapter["authorize"]>[0]) {
    if (!i.paymentMethodId) throw new AdapterError("No card details were provided.", "card_declined");
    try {
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
        payment_method: i.paymentMethodId, automatic_payment_methods: { enabled: true, allow_redirects: "never" },
        description: i.description, metadata: i.metadata,
        ...(customer ? { customer, setup_future_usage: "off_session" as const } : {}),
      }, { idempotencyKey: i.idempotencyKey });
      if (pi.status === "requires_action") {
        await this.stripe.paymentIntents.cancel(pi.id).catch(() => undefined);
        throw new AdapterError("Your bank asked for extra verification, which isn't supported yet.", "requires_action");
      }
      if (pi.status !== "requires_capture") throw new AdapterError(`Unexpected payment status ${pi.status}`, "card_declined");
      return { paymentIntentId: pi.id };
    } catch (e) {
      if (e instanceof AdapterError) throw e;
      const err = e as { type?: string; message?: string };
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

  async voidAuthorization(id: string) {
    const pi = await this.stripe.paymentIntents.retrieve(id);
    if (pi.status === "requires_capture" || pi.status === "requires_payment_method" || pi.status === "requires_confirmation") {
      await this.stripe.paymentIntents.cancel(id, {}, { idempotencyKey: `${id}:cancel` });
    }
  }
}
