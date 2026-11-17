"use client";
import { useEffect, useState } from "react";

/**
 * F's motion pieces (Oscar, Nov 16): see-through header that turns solid on scroll, slow reveal-on-scroll for anything
 * marked data-reveal (and the steps timeline), and the review loop's pause control. All of it respects
 * "reduce motion": nothing is hidden or moves when the visitor asks for less motion, and nothing is hidden before
 * the script runs.
 */
export function SiteHeader({ children }: { children: React.ReactNode }) {
  const [solid, setSolid] = useState(false);
  useEffect(() => {
    const on = () => setSolid(window.scrollY > 40);
    on(); window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return <header className={`F-top${solid ? " is-solid" : ""}`}>{children}</header>;
}

export function Reveal() {
  useEffect(() => {
    if (!("IntersectionObserver" in window)) return;
    const root = document.documentElement;
    root.classList.add("rv-ready");
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); }
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });
    const watch = () => document.querySelectorAll("[data-reveal]:not(.is-in)").forEach((el) => io.observe(el));
    watch();
    const mo = new MutationObserver(watch); // cards re-render after a search
    mo.observe(document.body, { childList: true, subtree: true });
    return () => { io.disconnect(); mo.disconnect(); root.classList.remove("rv-ready"); };
  }, []);
  return null;
}

export function ReviewLoop({ children }: { children: React.ReactNode }) {
  const [paused, setPaused] = useState(false);
  return (
    <div className={`F-loop${paused ? " is-paused" : ""}`}>
      <button type="button" className="F-loopBtn" aria-pressed={paused} onClick={() => setPaused((p) => !p)}>
        {paused ? "Play reviews" : "Pause reviews"}
      </button>
      {children}
    </div>
  );
}
