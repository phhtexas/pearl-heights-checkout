import { LAUNCHED } from "@/launch";
import type { Metadata } from "next";
import { groupPolicy, policyOverview } from "@/domain/policy";
import "./policy.css";
import { SiteNav } from "../../SiteNav";

/** Cancellation policy page (footer link, note 150). Text comes from the same policy engine the checkout uses. */
export const metadata: Metadata = { title: "Cancellation policy | Pearl Heights Homes", description: "Cancellation and refund terms for direct bookings with Pearl Heights Homes. Your exact dates and amounts are shown before you pay.", robots: { index: false } };

export default function Page() {
  const lines = policyOverview();
  return (
    <div className="P-page">
      <SiteNav />
      <main className="P-main">
        <h1>Cancellation policy</h1>
        <p className="P-lead">For stays booked directly with Pearl Heights Homes. Your exact dates and amounts are shown before you pay and in your confirmation.</p>
        <ul className="P-list">{groupPolicy(lines).map((g) => <li key={g.text}>{g.text}{g.sub.length > 0 && <ul className="P-sub">{g.sub.map((x) => <li key={x}>{x}</li>)}</ul>}</li>)}</ul>
        <h2>If we can&apos;t complete your booking</h2>
        <p>If your rental agreement or ID check isn&apos;t completed, or if we have to cancel your stay, you&apos;ll receive a full refund.</p>
        <p className="P-note">Times are San Antonio time (Central). {LAUNCHED ? <>Full details are in the <a href="/terms">Direct Booking Terms</a>.</> : "The full Terms of service are coming soon."}</p>
      </main>
    </div>
  );
}
