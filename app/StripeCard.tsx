"use client";
import { useEffect, useRef, useState } from "react";
import { Elements, ExpressCheckoutElement, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe, Stripe } from "@stripe/stripe-js";

let stripePromise: Promise<Stripe | null> | null = null;
// developerTools off: hides Stripe's test-mode "stripe >" helper tab in the corner (Oscar, Nov 17).
const getStripe = (pk: string) => (stripePromise ??= loadStripe(pk, { developerTools: { assistant: { enabled: false } } }));

export type CreatePm = (billing: { name: string; email: string; phone: string }) => Promise<{ id?: string; error?: string }>;
type Billing = { name: string; email: string; phone: string };

/**
 * Stripe Payment Element (deferred intent). Card data goes straight to Stripe; we only receive a pm_ id.
 * Oscar, Nov 17 (option 1): one-tap Apple Pay, Google Pay and Link above the card form (Express Checkout Element).
 * Same flow as the card: the wallet gives us a pm_ id, and the server authorizes it with manual capture. Each button
 * only shows when the guest's device/browser supports it and the site's domain is registered in Stripe.
 * The buttons stay locked until the guest agrees to the terms (the checkbox below), like the main pay button.
 */
export function StripeCard({ publishableKey, amount, saveForLater, onReady, canPay, billing, onExpress, onLockedTap }: {
  publishableKey: string; amount: number; saveForLater: boolean; onReady: (fn: CreatePm | null) => void;
  canPay: boolean; billing: Billing; onExpress: (paymentMethodId: string) => void; onLockedTap: () => void;
}) {
  return (
    <Elements stripe={getStripe(publishableKey)} options={{
      mode: "payment", amount, currency: "usd", captureMethod: "manual", paymentMethodCreation: "manual", allowedPaymentMethodTypes: ["card", "link"],
      ...(saveForLater ? { setupFutureUsage: "off_session" as const } : {}),
      appearance: { theme: "stripe", variables: { colorPrimary: "#111315", borderRadius: "12px", fontSizeBase: "16px" } },
    }}>
      <Inner onReady={onReady} canPay={canPay} billing={billing} onExpress={onExpress} onLockedTap={onLockedTap} />
    </Elements>
  );
}

// Stripe can report wallets at "ready" or later (e.g. Apple Pay after the device check), so both events update this.
const hasAny = (m: unknown) => !!m && Object.values(m as Record<string, boolean>).some(Boolean);

function Inner({ onReady, canPay, billing, onExpress, onLockedTap }: { onReady: (fn: CreatePm | null) => void; canPay: boolean; billing: Billing; onExpress: (id: string) => void; onLockedTap: () => void }) {
  const stripe = useStripe(), elements = useElements();
  const [wallets, setWallets] = useState(false);
  const canPayRef = useRef(canPay); canPayRef.current = canPay;
  const billingRef = useRef(billing); billingRef.current = billing;
  useEffect(() => {
    if (!stripe || !elements) { onReady(null); return; }
    onReady(async (b) => {
      const { error: submitError } = await elements.submit();
      if (submitError) return { error: submitError.message ?? "Please check your card details." };
      const { paymentMethod, error } = await stripe.createPaymentMethod({ elements, params: { billing_details: b } });
      if (error || !paymentMethod) return { error: error?.message ?? "Please check your card details." };
      return { id: paymentMethod.id };
    });
    return () => onReady(null);
  }, [stripe, elements, onReady]);
  return (
    <>
      <div className={"express" + (wallets ? "" : " isEmpty") + (canPay ? "" : " isLocked")}>
        <div className="expressBtns">
          <ExpressCheckoutElement
            options={{
              buttonType: { applePay: "book", googlePay: "book" }, buttonHeight: 50,
              paymentMethods: { applePay: "auto", googlePay: "auto", link: "auto", paypal: "never", amazonPay: "never", klarna: "never" },
              layout: { maxColumns: 1, maxRows: 3, overflow: "never" },
            }}
            onReady={({ availablePaymentMethods }) => setWallets(hasAny(availablePaymentMethods))}
            onAvailablePaymentMethodsChange={({ paymentMethods }) => setWallets(!!paymentMethods && Object.values(paymentMethods).some((m) => !!m?.available))}
            onClick={(e) => { if (!canPayRef.current) { onLockedTap(); return; } e.resolve(); }}
            onConfirm={async (e) => {
              if (!stripe || !elements) return;
              const { error: submitError } = await elements.submit();
              if (submitError) { e.paymentFailed({ reason: "fail" }); return; }
              const { paymentMethod, error } = await stripe.createPaymentMethod({ elements, params: { billing_details: billingRef.current } });
              if (error || !paymentMethod) { e.paymentFailed({ reason: "fail" }); return; }
              onExpress(paymentMethod.id);
            }}
          />
        </div>
        {!canPay && wallets && (
          <button type="button" className="expressLock" onClick={onLockedTap}>Tick “I agree” below to pay with one tap</button>
        )}
        {wallets && <div className="orCard" aria-hidden="true"><span>or pay with card</span></div>}
      </div>
      <PaymentElement options={{ layout: "tabs", wallets: { applePay: "never", googlePay: "never", link: "never" }, fields: { billingDetails: { name: "never", email: "never", phone: "never" } } }} />
    </>
  );
}
