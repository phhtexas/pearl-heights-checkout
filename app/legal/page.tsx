import type { Metadata } from "next";
import type { ReactNode } from "react";
import { legalDocs, LEGAL_UPDATED, LEGAL_VERSION, OPERATOR, type Block } from "@/content/legal";
import "./legal.css";

/**
 * Draft legal page, laid out like a help-center legal article (one page, a "which terms apply" box, then each
 * document with its own contents list). DRAFT: noindex, labeled, footer links still say "coming soon".
 * Text is Version 1.2 from the Google Docs (Legal note 11); attorney review is still pending.
 */
export const metadata: Metadata = { title: "Terms and policies (draft) | Pearl Heights Homes", robots: { index: false, follow: false } };
export const dynamic = "force-static";

/** Emails become links; [bracketed] text is a placeholder still to be filled in. */
function inline(text: string): ReactNode[] {
  return text.split(/(\[[^\]]+\]|[\w.+-]+@[\w-]+\.[\w.]+)/g).filter(Boolean).map((part, i) => {
    if (part.startsWith("[")) return <span key={i} className="L-fill">{part}</span>;
    if (/@/.test(part) && !/\s/.test(part)) return <a key={i} href={`mailto:${part}`}>{part}</a>;
    return part;
  });
}

function BlockView({ b }: { b: Block }) {
  switch (b.t) {
    case "h": return <h3 id={b.id}>{b.num && <>{b.num}. </>}{b.text}</h3>;
    case "sub": return <h4 id={b.id}>{b.text}</h4>;
    case "p": return <p>{inline(b.text)}</p>;
    case "note": return <p className="L-sample">{inline(b.text)}</p>;
    case "ul": return <ul>{b.items.map((x) => <li key={x}>{inline(x)}</li>)}</ul>;
    case "table": return (
      <div className="L-tableWrap">
        <table>
          <thead><tr>{b.head.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
          <tbody>{b.rows.map((r) => <tr key={r[0]}>{r.map((c, i) => i === 0 ? <th key={i} scope="row">{inline(c)}</th> : <td key={i}>{inline(c)}</td>)}</tr>)}</tbody>
        </table>
      </div>
    );
  }
}

export default function LegalPage() {
  const docs = legalDocs();
  return (
    <div className="L-page">
      <header className="L-top">
        <a href="/homes/736-myrtle" className="L-brand">Pearl Heights <span>HOMES</span></a>
      </header>
      <main className="L-main" id="top">
        <nav aria-label="Breadcrumb" className="L-crumbs">
          <ol><li><a href="/homes/736-myrtle">Home</a></li><li aria-current="page">Terms and policies</li></ol>
        </nav>
        <p className="L-draft" role="note"><strong>Draft — not for real bookings.</strong> These documents are under attorney review and are not in effect yet.</p>
        <p className="L-eyebrow">Legal terms</p>
        <h1>Terms and policies</h1>

        <section className="L-callout" aria-labelledby="which">
          <svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="12" r="9.5" /><path d="M2.5 12h19M12 2.5c2.6 2.7 3.9 5.9 3.9 9.5s-1.3 6.8-3.9 9.5c-2.6-2.7-3.9-5.9-3.9-9.5s1.3-6.8 3.9-9.5z" /></svg>
          <div>
            <h2 id="which">Which terms apply to you</h2>
            <p>These documents apply to stays booked directly with Pearl Heights Homes. If you booked through Airbnb, Vrbo or another marketplace, that marketplace&apos;s terms apply to your reservation instead.</p>
            <ul>
              {docs.map((d) => <li key={d.id}><span>{d.appliesTo}:</span> <a href={`#${d.id}`}>{d.title}</a></li>)}
              <li><span>For a short summary of refunds:</span> <a href="/policies/cancellation">Cancellation policy</a></li>
            </ul>
          </div>
        </section>

        {docs.map((d) => {
          const sections = d.blocks.filter((b): b is Extract<Block, { t: "h" }> => b.t === "h");
          return (
            <article key={d.id} className="L-doc" aria-labelledby={d.id}>
              <h2 id={d.id}>{d.title}</h2>
              <dl className="L-meta">
                <div><dt>Version</dt><dd>{LEGAL_VERSION} (draft)</dd></div>
                <div><dt>Effective</dt><dd>Upon publication</dd></div>
                <div><dt>Last updated</dt><dd>{LEGAL_UPDATED}</dd></div>
                <div><dt>Operator</dt><dd>{OPERATOR}</dd></div>
              </dl>
              <p className="L-summary">{d.summary}</p>
              <nav className="L-toc" aria-label={`${d.title}: contents`}>
                <h3>Table of contents</h3>
                <ol>
                  {sections.map((s) => (
                    <li key={s.id}>
                      <a href={`#${s.id}`}>{s.num && <>{s.num}. </>}{s.text}</a>
                      {s.subs.length > 0 && <ul>{s.subs.map((x) => <li key={x.id}><a href={`#${x.id}`}>{x.text}</a></li>)}</ul>}
                    </li>
                  ))}
                </ol>
              </nav>
              <div className="L-body">{d.blocks.map((b, i) => <BlockView key={i} b={b} />)}</div>
              <p className="L-back"><a href="#top">Back to top</a></p>
            </article>
          );
        })}
        <p className="L-foot">Questions about these terms? Email <a href="mailto:bookings@thepearlheightshomes.com">bookings@thepearlheightshomes.com</a>. Times are Central Time (San Antonio).</p>
      </main>
    </div>
  );
}
