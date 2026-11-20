import { ALL_HOMES, SiteNav } from "../SiteNav";
import { LAUNCHED } from "@/launch";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { LEGAL_UPDATED, LEGAL_VERSION, OPERATOR, legalDoc, searchIndex, type Block } from "@/content/legal";
import LegalSearch from "./LegalSearch";
import "./legal.css";

/** Shared pieces for the draft legal pages (/legal hub + one page per document). DRAFT: noindex + banner. */
/**
 * Documents published as final before the full launch (Oscar, Nov 20: attorney approved the Privacy Notice; Twilio's
 * toll-free review rejects a privacy page marked draft). No draft banner, title or version label on these pages.
 */
export const FINAL_DOCS = new Set(["privacy"]);
export const isFinal = (id?: string) => LAUNCHED || (!!id && FINAL_DOCS.has(id));
export const docMeta = (title: string, id: string): Metadata => (isFinal(id)
  ? { title: `${title} | Pearl Heights Homes`, robots: { index: false, follow: true } }
  : draftMeta(title));
export const draftMeta = (title: string): Metadata => (LAUNCHED
  ? { title: `${title} | Pearl Heights Homes`, robots: { index: false, follow: true } }
  : { title: `${title} (draft) | Pearl Heights Homes`, robots: { index: false, follow: false } });

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
    case "h": return <h2 id={b.id}>{b.num && <>{b.num}. </>}{b.text}</h2>;
    case "sub": return <h3 id={b.id}>{b.text}</h3>;
    case "p": return <p>{inline(b.text)}</p>;
    case "note": return <p className="L-sample">{inline(b.text)}</p>;
    case "ul": return <ul>{b.items.map((x) => <li key={x}>{inline(x)}</li>)}</ul>;
    case "table": return (
      <div className="L-tableWrap">
        <table>
          <thead><tr>{b.head.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
          <tbody>{b.rows.map((r, ri) => <tr key={ri}>{r.map((c, i) => i === 0 ? <th key={i} scope="row">{inline(c)}</th> : <td key={i}>{inline(c)}</td>)}</tr>)}</tbody>
        </table>
      </div>
    );
  }
}

export function Shell({ crumbs, children, final = LAUNCHED }: { crumbs: { label: string; href?: string }[]; children: ReactNode; final?: boolean }) {
  return (
    <div className="L-page">
      <SiteNav />
      <main className="L-main" id="top">
        <nav aria-label="Breadcrumb" className="L-crumbs">
          <ol>{crumbs.map((c) => <li key={c.label} aria-current={c.href ? undefined : "page"}>{c.href ? <a href={c.href}>{c.label}</a> : c.label}</li>)}</ol>
        </nav>
        {!final && <p className="L-draft" role="note"><strong>Draft — not for real bookings.</strong> These documents are under attorney review and are not in effect yet.</p>}
        <LegalSearch entries={searchIndex()} />
        {children}
        <p className="L-foot">Questions about these terms? Email <a href="mailto:bookings@pearlheightshomes.com">bookings@pearlheightshomes.com</a>. Times are Central Time (San Antonio).</p>
      </main>
    </div>
  );
}

export function DocPage({ id }: { id: string }) {
  const d = legalDoc(id);
  const sections = d.blocks.filter((b): b is Extract<Block, { t: "h" }> => b.t === "h");
  return (
    <Shell final={isFinal(id)} crumbs={[{ label: "Home", href: ALL_HOMES }, { label: "Terms and policies", href: "/legal" }, { label: d.title }]}>
      <article className="L-doc" aria-labelledby="doc-title">
        <p className="L-eyebrow">Legal terms</p>
        <h1 id="doc-title">{d.title}</h1>
        <dl className="L-meta">
          <div><dt>Version</dt><dd>{LEGAL_VERSION}{isFinal(id) ? "" : " (draft)"}</dd></div>
          <div><dt>Effective</dt><dd>Upon publication</dd></div>
          <div><dt>Last updated</dt><dd>{LEGAL_UPDATED}</dd></div>
          <div><dt>Operator</dt><dd>{OPERATOR}</dd></div>
        </dl>
        <p className="L-summary">{d.summary}</p>
        <nav className="L-toc" aria-label="Table of contents">
          <h2>Table of contents</h2>
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
        <p className="L-back"><a href="#top">Back to top</a> · <a href="/legal">All terms and policies</a></p>
      </article>
    </Shell>
  );
}
