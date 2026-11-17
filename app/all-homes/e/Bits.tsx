"use client";
import { useEffect, useRef, useState } from "react";

/** Small interactive pieces of mockup E: the header's scrolled border, and the review carousel arrows. */
export function Header({ children }: { children: React.ReactNode }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on(); window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return <header id="hdr" className={scrolled ? "scrolled" : undefined}>{children}</header>;
}

export function Reviews({ children }: { children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ start: true, end: false });
  const update = () => { const el = box.current; if (el) setEdge({ start: el.scrollLeft <= 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 }); };
  useEffect(() => { update(); window.addEventListener("resize", update); return () => window.removeEventListener("resize", update); }, []);
  const step = (d: number) => {
    const el = box.current; const c = el?.querySelector(".E-rev");
    el?.scrollBy({ left: d * ((c?.getBoundingClientRect().width ?? 400) + 16), behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };
  const arrow = (d: number, label: string, path: string, disabled: boolean) => (
    <button type="button" className="E-arrow" aria-label={label} disabled={disabled} onClick={() => step(d)}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={path} /></svg>
    </button>
  );
  return (
    <>
      <div className="E-revnav">{arrow(-1, "Previous reviews", "m15 6-6 6 6 6", edge.start)}{arrow(1, "Next reviews", "m9 6 6 6-6 6", edge.end)}</div>
      <div className="E-revs" id="revs" ref={box} onScroll={update} tabIndex={0} role="region" aria-label="Guest reviews, scroll sideways">{children}</div>
    </>
  );
}
