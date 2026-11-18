"use client";
import { useEffect, useState } from "react";
import { captureAttribution, consent, loadTrackers, setConsent, trackingConfigured } from "@/client/consent";
import { installCtaTracking } from "@/client/track";

/**
 * Cookie banner (Oscar, Nov 18). Shown only when analytics IDs are set and the visitor hasn't chosen yet.
 * Accept loads Google Analytics and the Meta Pixel; Decline loads nothing. Equal-weight buttons, no pre-checked boxes.
 */
export function ConsentBanner() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    captureAttribution();
    installCtaTracking();
    if (!trackingConfigured()) return;
    const c = consent();
    if (c === "granted") loadTrackers();
    if (c === "unset") setShow(true);
    const reopen = () => setShow(true);
    window.addEventListener("ph-cookie-choices", reopen);
    return () => window.removeEventListener("ph-cookie-choices", reopen);
  }, []);
  if (!show) return null;
  const pick = (v: "granted" | "denied") => { setConsent(v); setShow(false); };
  return (
    <div className="PH-consent" role="region" aria-label="Cookie choices">
      <p>We use cookies to see how people use our site and to show our ads to people who visited. <a href="/privacy">Privacy Notice</a></p>
      <div>
        <button type="button" onClick={() => pick("denied")}>Decline</button>
        <button type="button" onClick={() => pick("granted")}>Accept</button>
      </div>
    </div>
  );
}
