"use client";
import { useEffect } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe, Stripe } from "@stripe/stripe-js";

let stripePromise: Promise<Stripe | null> | null = null;
const getStripe = (pk: string) => (stripePromise ??= loadStripe(pk));

export type CreatePm = (billing: { name: string; email: string; phone: string }) => Promise<{ id?: string; error?: string }>;

/** Stripe Payment Element (deferred intent). Card data goes straight to Stripe; we only receive a pm_ id. */
export function StripeCard({ publishableKey, amount, saveForLater, onReady }: { publishableKey: string; amount: number; saveForLater: boolean; onReady: (fn: CreatePm | null) => void }) {
  return (
    <Elements stripe={getStripe(publishableKey)} options={{
      mode: "payment", amount, currency: "usd", captureMethod: "manual", paymentMethodCreation: "manual", allowedPaymentMethodTypes: ["card"],
      ...(saveForLater ? { setupFutureUsage: "off_session" as const } : {}),
      appearance: { theme: "stripe", variables: { colorPrimary: "#111315", borderRadius: "12px", fontSizeBase: "16px" } },
    }}>
      <Inner onReady={onReady} />
    </Elements>
  );
}

function Inner({ onReady }: { onReady: (fn: CreatePm | null) => void }) {
  const stripe = useStripe(), elements = useElements();
  useEffect(() => {
    if (!stripe || !elements) { onReady(null); return; }
    onReady(async (billing) => {
      const { error: submitError } = await elements.submit();
      if (submitError) return { error: submitError.message ?? "Please check your card details." };
      const { paymentMethod, error } = await stripe.createPaymentMethod({ elements, params: { billing_details: billing } });
      if (error || !paymentMethod) return { error: error?.message ?? "Please check your card details." };
      return { id: paymentMethod.id };
    });
    return () => onReady(null);
  }, [stripe, elements, onReady]);
  return <PaymentElement options={{ layout: "tabs", wallets: { applePay: "never", googlePay: "never", link: "never" }, fields: { billingDetails: { name: "never", email: "never", phone: "never" } } }} />;
}
