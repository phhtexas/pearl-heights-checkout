"use client";
import { useId, useMemo, useRef, useState, type ReactNode } from "react";
import type { SearchEntry } from "@/content/legal";

/**
 * Search across all four legal documents. As the guest types, matching sections show up underneath
 * (ARIA combobox + listbox: arrow keys move, Enter opens, Escape closes). Every word typed must appear
 * in the section's heading or text; heading matches rank first.
 */
const MAX = 8;
const STOP = new Set(["a", "an", "and", "are", "at", "be", "by", "can", "do", "for", "how", "i", "if", "in", "is", "it", "my", "of", "on", "or", "the", "to", "we", "what", "when", "you"]);
/** Search words: lowercase, hyphenated terms kept whole ("check-in"), filler words dropped, simple plural trimmed. */
const words = (q: string) =>
  q.toLowerCase().split(/[^a-z0-9$%-]+/).map((w) => w.replace(/^-+|-+$/g, ""))
    .filter((w) => w.length > 1 && !STOP.has(w)).map((w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w));
const esc = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Matches at the start of a word, so "pet" finds "pets" but not "competing". */
const startsWord = (w: string) => new RegExp(`(^|[^a-z0-9])${esc(w)}`, "i");

function find(entries: SearchEntry[], q: string) {
  const ws = words(q);
  if (!ws.length) return [];
  const res = ws.map(startsWord);
  const hits: { e: SearchEntry; score: number }[] = [];
  for (const e of entries) {
    const own = e.label.split(" \u203a ").pop() ?? e.label; // the entry's own heading, without its parent section
    if (!res.every((r) => r.test(e.label) || r.test(e.text))) continue;
    hits.push({ e, score: res.filter((r) => r.test(own)).length * 20 + res.filter((r) => r.test(e.label)).length * 10 + res.filter((r) => r.test(e.text)).length });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, MAX).map((h) => h.e);
}

function snippet(text: string, ws: string[]) {
  const t = text;
  const at = Math.min(...ws.map((w) => t.search(startsWord(w))).filter((i) => i >= 0));
  if (!Number.isFinite(at)) return text.slice(0, 110) + (text.length > 110 ? "…" : "");
  const start = Math.max(0, text.lastIndexOf(" ", Math.max(0, at - 40)) + 1);
  const out = text.slice(start, start + 120);
  return (start > 0 ? "…" : "") + out + (start + 120 < text.length ? "…" : "");
}

function mark(s: string, ws: string[]): ReactNode[] {
  if (!ws.length) return [s];
  const re = new RegExp(`(?<![a-z0-9])(${ws.map(esc).join("|")})`, "gi");
  return s.split(re).map((p, i) => (i % 2 ? <mark key={i}>{p}</mark> : p));
}

export default function LegalSearch({ entries }: { entries: SearchEntry[] }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const box = useRef<HTMLDivElement>(null);
  const id = useId();
  const results = useMemo(() => find(entries, q), [entries, q]);
  const ws = useMemo(() => words(q), [q]);
  const show = open && ws.length > 0;
  const go = (e: SearchEntry) => { setOpen(false); window.location.href = e.href; };

  return (
    <div className="L-search" ref={box} onBlur={(e) => { if (!box.current?.contains(e.relatedTarget as Node)) setOpen(false); }}>
      <label htmlFor={`${id}-q`} className="L-srOnly">Search terms and policies</label>
      <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
      <input
        id={`${id}-q`}
        type="search"
        role="combobox"
        aria-expanded={show}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={show && active >= 0 ? `${id}-o${active}` : undefined}
        placeholder="Search terms and policies"
        autoComplete="off"
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(-1); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, results.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === "Enter") { const r = results[active >= 0 ? active : 0]; if (show && r) { e.preventDefault(); go(r); } }
          else if (e.key === "Escape") { setOpen(false); setActive(-1); }
        }}
      />
      <ul id={`${id}-list`} role="listbox" aria-label="Matching sections" className="L-results" hidden={!show}>
        {results.map((r, i) => (
          <li key={r.href} id={`${id}-o${i}`} role="option" aria-selected={i === active} className={i === active ? "is-active" : undefined}
            onMouseDown={(e) => { e.preventDefault(); go(r); }} onMouseEnter={() => setActive(i)}>
            <span className="L-rDoc">{r.doc}</span>
            <span className="L-rLabel">{mark(r.label, ws)}</span>
            {r.text && <span className="L-rText">{mark(snippet(r.text, ws), ws)}</span>}
          </li>
        ))}
        {show && results.length === 0 && <li className="L-rNone" role="option" aria-disabled="true" aria-selected="false">No matches. Try another word, or email us.</li>}
      </ul>
      <p className="L-srOnly" aria-live="polite">{show ? (results.length ? `${results.length} matching section${results.length === 1 ? "" : "s"}` : "No matches") : ""}</p>
    </div>
  );
}
