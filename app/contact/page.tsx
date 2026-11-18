import type { Metadata } from "next";
import { SiteNav } from "../SiteNav";
import { OPERATOR } from "@/content/legal";
import { HOMES } from "@/content/homes";
import "../legal/legal.css";
import "./contact.css";

/**
 * Contact page (Oscar, Nov 17): the Stripe "Customer support URL" (pearlheightshomes.com/contact at launch).
 * Facts: email = business contact Oscar confirmed (Nov 2026); "usually reply within an hour" = host facts (Airbnb host
 * profile, homeSources). The urgent phone number is server-only by design (shown to verified guests in their stay
 * page), so it is NOT on this public page. noindex while the site is in test.
 */
export const metadata: Metadata = { title: "Contact us | Pearl Heights Homes", robots: { index: false, follow: false } };
export const dynamic = "force-static";

const EMAIL = "bookings@pearlheightshomes.com";

export default function Page() {
  return (
    <div className="L-page">
      <SiteNav />
      <main className="L-main CT" id="top">
        <p className="L-eyebrow">Contact</p>
        <h1>We&apos;re here to help</h1>
        <p className="CT-lead">We&apos;re {HOMES["752"]!.host.names}, the hosts of Pearl Heights Homes in San Antonio. Questions go straight to us.</p>

        <section className="CT-card" aria-labelledby="ct-book">
          <h2 id="ct-book">Questions before you book</h2>
          <p>Email us at <a href={`mailto:${EMAIL}`}>{EMAIL}</a>. We usually reply within an hour.</p>
          <p className="CT-dim">Tell us the home, your dates and how many guests, and we&apos;ll help you find the right fit.</p>
        </section>

        <section className="CT-card" aria-labelledby="ct-booked">
          <h2 id="ct-booked">Already booked?</h2>
          <p>Your private stay page has everything in one place: your rental agreement, ID check, check-in details and messages to us. The link is in your confirmation email.</p>
          <p className="CT-dim">Can&apos;t find it? Email <a href={`mailto:${EMAIL}`}>{EMAIL}</a> from the address you booked with and we&apos;ll resend it.</p>
        </section>

        <section className="CT-card" aria-labelledby="ct-stay">
          <h2 id="ct-stay">During your stay</h2>
          <p>Message us from your stay page anytime. For something urgent at the home, your stay page shows our urgent contact number once your paperwork is complete.</p>
          <p className="CT-alert">In an emergency, call 911 first.</p>
        </section>

        <section className="CT-card" aria-labelledby="ct-policies">
          <h2 id="ct-policies">Policies</h2>
          <ul className="CT-links">
            <li><a href="/terms">Direct Booking Terms</a></li>
            <li><a href="/policies/cancellation">Cancellation policy</a></li>
            <li><a href="/rental-agreement">Rental Agreement and House Rules</a></li>
            <li><a href="/privacy">Privacy and Cookie Notice</a></li>
          </ul>
        </section>

        <p className="L-foot">{OPERATOR} · San Antonio, Texas · Times are Central Time.</p>
      </main>
    </div>
  );
}
