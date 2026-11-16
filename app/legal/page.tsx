import { legalDocs } from "@/content/legal";
import { Shell, draftMeta } from "./parts";

/**
 * Draft legal hub, laid out like a help-center legal article: search, a "which terms apply" box, and one card
 * per document. Each document has its own page (/terms, /rental-agreement, /privacy, /website-terms).
 * Text is Version 1.2 from the Google Docs (Legal note 11); attorney review is still pending.
 */
export const metadata = draftMeta("Terms and policies");
export const dynamic = "force-static";

export default function LegalHub() {
  const docs = legalDocs();
  return (
    <Shell crumbs={[{ label: "Home", href: "/homes/736-myrtle" }, { label: "Terms and policies" }]}>
      <p className="L-eyebrow">Legal terms</p>
      <h1>Terms and policies</h1>

      <section className="L-callout" aria-labelledby="which">
        <svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="12" r="9.5" /><path d="M2.5 12h19M12 2.5c2.6 2.7 3.9 5.9 3.9 9.5s-1.3 6.8-3.9 9.5c-2.6-2.7-3.9-5.9-3.9-9.5s1.3-6.8 3.9-9.5z" /></svg>
        <div>
          <h2 id="which">Which terms apply to you</h2>
          <p>These documents apply to stays booked directly with Pearl Heights Homes. If you booked through Airbnb, Vrbo or another marketplace, that marketplace&apos;s terms apply to your reservation instead.</p>
        </div>
      </section>

      <ul className="L-cards">
        {docs.map((d) => (
          <li key={d.id}>
            <a href={d.href}>
              <span className="L-cardFor">{d.appliesTo}</span>
              <span className="L-cardTitle">{d.title}</span>
              <span className="L-cardText">{d.summary}</span>
            </a>
          </li>
        ))}
        <li>
          <a href="/policies/cancellation">
            <span className="L-cardFor">Short version</span>
            <span className="L-cardTitle">Cancellation policy summary</span>
            <span className="L-cardText">The refund schedule in plain words.</span>
          </a>
        </li>
      </ul>
    </Shell>
  );
}
