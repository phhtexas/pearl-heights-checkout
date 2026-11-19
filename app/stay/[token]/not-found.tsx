import "../stay.css";

/**
 * Unknown, expired or revoked stay link (Perplexity PX-F9, Nov 19). Stays generic: it never says whether a booking
 * exists, and never echoes the token. Gives the guest a way back: their confirmation email, or the Contact page.
 */
export default function StayNotFound() {
  return (
    <div className="ST">
      <header className="ST-top">
        <a href="/all-homes/f" className="ST-brand"><img src="/brand/logo-dark.webp" alt="Pearl Heights Homes" width={200} height={174} /></a>
      </header>
      <main className="ST-main ST-lost">
        <section className="ST-card">
          <h1>This link isn&apos;t working</h1>
          <p className="ST-dim">It may have expired, or part of it may be missing. Your private stay link is in your booking confirmation email.</p>
          <p className="ST-dim">Can&apos;t find it? Contact us with the name on the booking and we&apos;ll help you get back to your stay page.</p>
          <p className="ST-lostActs"><a className="ST-ask" href="/contact">Contact us</a> <a href="/all-homes/f">Browse homes</a></p>
        </section>
      </main>
    </div>
  );
}
