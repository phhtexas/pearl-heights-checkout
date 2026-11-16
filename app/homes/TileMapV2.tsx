"use client";
import { useRef, useState } from "react";

/**
 * Small tile map (OpenStreetMap tiles, no library): centered on an approximate point, never the exact address.
 * `interactive` adds drag-to-pan and +/- zoom (full-screen view). Tiles are greyed in CSS for a calmer, Airbnb-like look.
 */
const TILE = 256;
const project = (lat: number, lon: number, z: number) => {
  const n = 2 ** z, r = (lat * Math.PI) / 180;
  return { x: ((lon + 180) / 360) * n * TILE, y: ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n * TILE };
};

export function TileMapV2({ lat, lon, zoom: z0, interactive = false, span = 2 }: { lat: number; lon: number; zoom: number; interactive?: boolean; span?: number }) {
  const [z, setZ] = useState(z0);
  const [off, setOff] = useState({ x: 0, y: 0 }); // pan offset in pixels at the current zoom
  const drag = useRef<{ x: number; y: number } | null>(null);
  const c = project(lat, lon, z);
  const cx = c.x - off.x, cy = c.y - off.y; // world pixel at the middle of the box
  const tx = Math.floor(cx / TILE), ty = Math.floor(cy / TILE);
  const tiles: { x: number; y: number; left: number; top: number }[] = [];
  for (let dx = -span; dx <= span; dx++) for (let dy = -span; dy <= span; dy++) {
    const x = tx + dx, y = ty + dy;
    tiles.push({ x, y, left: x * TILE - cx, top: y * TILE - cy });
  }
  const n = 2 ** z;
  const zoomTo = (k: number) => { const nz = Math.min(17, Math.max(11, z + k)); setOff({ x: off.x * 2 ** (nz - z), y: off.y * 2 ** (nz - z) }); setZ(nz); };
  // The home marker sits on the approximate point and moves with the map.
  const pin = { left: c.x - cx, top: c.y - cy };

  return (
    <div className={"TV-map" + (interactive ? " TV-live" : "")}
      onPointerDown={interactive ? (e) => { if ((e.target as HTMLElement).closest("button, a")) return; drag.current = { x: e.clientX, y: e.clientY }; (e.target as HTMLElement).setPointerCapture?.(e.pointerId); } : undefined}
      onPointerMove={interactive ? (e) => { if (!drag.current) return; const d = { x: e.clientX - drag.current.x, y: e.clientY - drag.current.y }; drag.current = { x: e.clientX, y: e.clientY }; setOff((o) => ({ x: o.x + d.x, y: o.y + d.y })); } : undefined}
      onPointerUp={interactive ? () => { drag.current = null; } : undefined}>
      <div className="TV-tiles" aria-hidden="true">
        {tiles.map((t) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={`${z}-${t.x}-${t.y}`} alt="" draggable={false} loading={interactive ? "eager" : "lazy"} decoding="async" src={`https://tile.openstreetmap.org/${z}/${((t.x % n) + n) % n}/${t.y}.png`}
            style={{ left: `calc(50% + ${t.left}px)`, top: `calc(50% + ${t.top}px)` }} />
        ))}
      </div>
      <span className="V-pin TV-pin" style={{ left: `calc(50% + ${pin.left}px)`, top: `calc(50% + ${pin.top}px)` }} aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 24 24"><path d="M4 11l8-7 8 7v9h-5v-5h-6v5H4z" fill="#fff" /></svg>
      </span>
      {interactive && (
        <div className="TV-zoom">
          <button onClick={() => zoomTo(1)} aria-label="Zoom in">+</button>
          <button onClick={() => zoomTo(-1)} aria-label="Zoom out">−</button>
        </div>)}
      <a className="TV-credit" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a>
    </div>
  );
}
