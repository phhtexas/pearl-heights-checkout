import type { Metadata } from "next";
import { policyOverview } from "@/domain/policy";
import "./policy.css";

/** Cancellation policy page (footer link, note 150). Text comes from the same policy engine the checkout uses. */
export const metadata: Metadata = { title: "Cancellation policy | Pearl Heights Homes", robots: { index: false } };

export default function Page() {
  const lines = policyOverview();
  return (
    <div className="P-page">
      <header className="P-top"><a href="/homes/736-myrtle" className="P-brand"><img className="brandLogo" src="/brand/logo-dark.webp" alt="Pearl Heights Homes" width={200} height={174} /></a></header>
      <main className="P-main">
        <h1>Cancellation policy</h1>
        <p className="P-lead">For stays booked directly with Pearl Heights Homes. Your exact dates and amounts are shown before you pay and in your confirmation.</p>
        <ul className="P-list">{lines.map((l) => <li key={l}>{l}</li>)}</ul>
        <h2>If we can&apos;t complete your booking</h2>
        <p>If your rental agreement and ID check aren&apos;t completed, or if we have to cancel your stay, you get everything back with no fee.</p>
        <p className="P-note">Times are San Antonio time (Central). The full Terms of service are coming soon.</p>
      </main>
    </div>
  );
}
