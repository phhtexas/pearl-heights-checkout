import "../../stay/stay.css";

/** Unknown or expired conversation link: generic, never echoes the link. */
export default function ConversationNotFound() {
  return (
    <div className="ST">
      <header className="ST-top">
        <a href="/all-homes/f" className="ST-brand"><img src="/brand/logo-dark.webp" alt="Pearl Heights Homes" width={200} height={174} /></a>
      </header>
      <main className="ST-main ST-lost">
        <section className="ST-card">
          <h1>This link isn&apos;t working</h1>
          <p className="ST-dim">It may have expired, or part of it may be missing. Your private conversation link is in the email we sent you.</p>
          <p className="ST-lostActs"><a className="ST-ask" href="/contact">Contact us</a> <a href="/all-homes/f">Browse homes</a></p>
        </section>
      </main>
    </div>
  );
}
