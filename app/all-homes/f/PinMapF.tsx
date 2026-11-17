"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * F copy of C's PinMap (C unchanged). All five homes on one map (OpenStreetMap tiles, no map library, same look as the listing map). Each pin sits on the
 * listing's approximate point (never the house). Nothing loads until the map scrolls near the screen (speed).
 * Pins show the rating before a search and the exact total after; a tap scrolls to that home's card.
 *
 * Oscar, Nov 17: selecting a neighborhood draws ONE soft sage circle around that neighborhood's pins (built from the
 * same approximate public points; never an address). A new selection replaces the old circle. Pins stay above the
 * circle and clickable. If the circle already fits, the view doesn't move; otherwise the map shifts just enough
 * (and only if that can't work, zooms out one step) to show the circle and its pins with padding.
 */
const TILE = 256;
const PAD = 16;           // keep the circle this far inside the map edge
const RING = 18;          // space between a pin's label and the circle edge
const project = (lat: number, lon: number, z: number) => {
  const n = 2 ** z, r = (lat * Math.PI) / 180;
  return { x: ((lon + 180) / 360) * n * TILE, y: ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n * TILE };
};
export type Pin = { key: string; lat: number; lon: number; label: string; title: string; off?: boolean };
export type Area = { name: string; keys: string[] } | null;

export function PinMapF({ pins, zoom: baseZoom = 12, area = null }: { pins: Pin[]; zoom?: number; area?: Area }) {
  const box = useRef<HTMLDivElement>(null);
  const pinEls = useRef<Record<string, HTMLButtonElement | null>>({});
  const [show, setShow] = useState(false);
  const [zoom, setZoom] = useState(baseZoom);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [circle, setCircle] = useState<{ x: number; y: number; r: number } | null>(null);
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
  for (let dx = -4; dx <= 4; dx++) for (let dy = -3; dy <= 3; dy++) tiles.push({ x: tx + dx, y: ty + dy, left: (tx + dx) * TILE - c.x, top: (ty + dy) * TILE - c.y });

  // Pixel spots, nudged apart when two homes share an area (736 and 752 are a block apart).
  const spots = pins.map((p) => { const q = project(p.lat, p.lon, zoom); return { ...p, left: q.x - c.x, top: q.y - c.y }; });
  // F: labels can be wide ("Unavailable", "$2,402"): stack close pins vertically instead of side by side.
  for (let i = 0; i < spots.length; i++) for (let j = 0; j < i; j++) {
    const a = spots[j]!, b = spots[i]!;
    if (Math.abs(a.left - b.left) < 120 && Math.abs(a.top - b.top) < 40) { a.top -= 22; b.top += 22; }
  }

  // Circle around the selected neighborhood's pins (measured labels, so a wide "$2,402" pin is fully inside).
  const areaKey = area ? area.keys.join(",") : "";
  const labelKey = pins.map((p) => p.label).join("|");
  useLayoutEffect(() => {
    if (!area) { setCircle(null); return; }
    const mine = spots.filter((s) => area.keys.includes(s.key));
    if (!mine.length) { setCircle(null); return; }
    const xs = mine.map((s) => s.left), ys = mine.map((s) => s.top);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const r = Math.max(...mine.map((s) => {
      const el = pinEls.current[s.key];
      const hw = (el?.offsetWidth ?? 70) / 2, hh = (el?.offsetHeight ?? 34) / 2;
      return Math.hypot(Math.abs(s.left - cx) + hw, Math.abs(s.top - cy) + hh);
    })) + RING;
    const W = box.current?.clientWidth ?? 0, H = box.current?.clientHeight ?? 0;
    // Too big for the map at this zoom? Step out once (Tobin Hill / Alamo Heights fit at 12; this is a safety net).
    if (W && H && (2 * r > W - 2 * PAD || 2 * r > H - 2 * PAD) && zoom > baseZoom - 1) { setZoom(zoom - 1); return; }
    // Shift only as much as needed so circle (center + pan) sits inside the map with padding; otherwise keep the view.
    const fit = (p: number, half: number, size: number) => {
      const lo = -size / 2 + PAD + r, hi = size / 2 - PAD - r; // allowed range for the circle center on screen
      const on = p + half;
      return on < lo ? p + (lo - on) : on > hi ? p - (on - hi) : p;
    };
    setCircle({ x: cx, y: cy, r });
    if (W && H) setPan((pv) => { const nx = fit(pv.x, cx, W), ny = fit(pv.y, cy, H); return nx === pv.x && ny === pv.y ? pv : { x: nx, y: ny }; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areaKey, labelKey, zoom]);
  // Back to the starting zoom when the selection no longer needs the zoom-out.
  useEffect(() => { if (!area && zoom !== baseZoom) { setZoom(baseZoom); setPan({ x: 0, y: 0 }); } }, [area, zoom, baseZoom]);

  const go = (key: string) => {
    const el = document.getElementById(`home-${key}`);
    if (!el) return;
    el.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    el.classList.add("is-flash"); setTimeout(() => el.classList.remove("is-flash"), 1600);
  };
  const at = (x: number, y: number) => ({ left: `calc(50% + ${x + pan.x}px)`, top: `calc(50% + ${y + pan.y}px)` });

  return (
    <div className="C-map F-map" ref={box} data-pan={`${Math.round(pan.x)},${Math.round(pan.y)}`} data-zoom={zoom}>
      {show && (
        <div className="C-tiles" aria-hidden="true">
          {tiles.map((t) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={`${zoom}-${t.x}-${t.y}`} alt="" draggable={false} decoding="async" src={`https://tile.openstreetmap.org/${zoom}/${t.x}/${t.y}.png`}
              style={at(t.left, t.top)} />
          ))}
        </div>
      )}
      {circle && area && (
        <div key={areaKey} className="F-area" aria-hidden="true" data-area={area.name}
          style={{ ...at(circle.x, circle.y), width: circle.r * 2, height: circle.r * 2 }} />
      )}
      {spots.map((s) => (
        <button key={s.key} ref={(el) => { pinEls.current[s.key] = el; }} type="button" data-key={s.key}
          className={`C-pin${s.off ? " is-off" : ""}${area?.keys.includes(s.key) ? " is-area" : ""}`} style={at(s.left, s.top)}
          onClick={() => go(s.key)} aria-label={`${s.title}: ${s.label}. Show this home`}>{s.label}</button>
      ))}
      <p className="sr-only" aria-live="polite">{area ? `${area.name}: ${area.keys.length} home${area.keys.length > 1 ? "s" : ""} circled on the map.` : ""}</p>
      <p className="C-mapNote">Circles show approximate areas, not exact addresses.</p>
      <a className="C-credit" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a>
    </div>
  );
}
