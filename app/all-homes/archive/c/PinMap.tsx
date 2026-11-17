"use client";
import { useEffect, useRef, useState } from "react";

/**
 * All five homes on one map (OpenStreetMap tiles, no map library, same look as the listing map). Each pin sits on the
 * listing's approximate point (never the house). Nothing loads until the map scrolls near the screen (speed).
 * Pins show the rating before a search and the exact total after; a tap scrolls to that home's card.
 */
const TILE = 256;
const project = (lat: number, lon: number, z: number) => {
  const n = 2 ** z, r = (lat * Math.PI) / 180;
  return { x: ((lon + 180) / 360) * n * TILE, y: ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n * TILE };
};
export type Pin = { key: string; lat: number; lon: number; label: string; title: string; off?: boolean };

export function PinMap({ pins, zoom = 12 }: { pins: Pin[]; zoom?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);
  useEffect(() => {
    const el = box.current;
    if (!el || !("IntersectionObserver" in window)) { setShow(true); return; }
    const io = new IntersectionObserver((e) => { if (e.some((x) => x.isIntersecting)) { setShow(true); io.disconnect(); } }, { rootMargin: "300px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const lat = (Math.min(...pins.map((p) => p.lat)) + Math.max(...pins.map((p) => p.lat))) / 2;
  const lon = (Math.min(...pins.map((p) => p.lon)) + Math.max(...pins.map((p) => p.lon))) / 2;
  const c = project(lat, lon, zoom);
  const tx = Math.floor(c.x / TILE), ty = Math.floor(c.y / TILE);
  const tiles: { x: number; y: number; left: number; top: number }[] = [];
  for (let dx = -3; dx <= 3; dx++) for (let dy = -2; dy <= 2; dy++) tiles.push({ x: tx + dx, y: ty + dy, left: (tx + dx) * TILE - c.x, top: (ty + dy) * TILE - c.y });

  // Pixel spots, nudged apart when two homes share an area (736 and 752 are a block apart).
  const spots = pins.map((p) => { const q = project(p.lat, p.lon, zoom); return { ...p, left: q.x - c.x, top: q.y - c.y }; });
  for (let i = 0; i < spots.length; i++) for (let j = 0; j < i; j++) {
    const a = spots[j]!, b = spots[i]!;
    if (Math.abs(a.left - b.left) < 80 && Math.abs(a.top - b.top) < 34) { a.left -= 42; b.left += 42; }
  }

  const go = (key: string) => {
    const el = document.getElementById(`home-${key}`);
    if (!el) return;
    el.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    el.classList.add("is-flash"); setTimeout(() => el.classList.remove("is-flash"), 1600);
  };

  return (
    <div className="C-map" ref={box}>
      {show && (
        <div className="C-tiles" aria-hidden="true">
          {tiles.map((t) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={`${t.x}-${t.y}`} alt="" draggable={false} decoding="async" src={`https://tile.openstreetmap.org/${zoom}/${t.x}/${t.y}.png`}
              style={{ left: `calc(50% + ${t.left}px)`, top: `calc(50% + ${t.top}px)` }} />
          ))}
        </div>
      )}
      {spots.map((s) => (
        <button key={s.key} type="button" className={`C-pin${s.off ? " is-off" : ""}`} style={{ left: `calc(50% + ${s.left}px)`, top: `calc(50% + ${s.top}px)` }}
          onClick={() => go(s.key)} aria-label={`${s.title}: ${s.label}. Show this home`}>{s.label}</button>
      ))}
      <p className="C-mapNote">Pins show the area, not the exact address.</p>
      <a className="C-credit" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a>
    </div>
  );
}
