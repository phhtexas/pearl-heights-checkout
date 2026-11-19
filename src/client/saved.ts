"use client";
import { useEffect, useState } from "react";
import { track } from "./track";

/**
 * Saved homes (Oscar, Nov 19, option 2): the heart saves a home in this browser (no accounts) and, when a home is saved,
 * records it as interest: GA4 "add_to_wishlist" and Meta "AddToWishlist" (only after cookie Accept, like every event),
 * so people who saved a home but didn't book can be retargeted. Shared by the home pages and the All Homes cards.
 */
const KEY = (k: string) => "ph-saved-" + k;
const EVT = "ph-saved-change";

export function isSaved(key: string): boolean {
  try { return localStorage.getItem(KEY(key)) === "1"; } catch { return false; }
}

export function setSaved(key: string, on: boolean, where: string) {
  try { localStorage.setItem(KEY(key), on ? "1" : "0"); } catch { /* private mode: still works for this page */ }
  if (on) track("save_home", { property: key, cta: where }, "save" + key + Date.now());
  dispatchEvent(new CustomEvent(EVT, { detail: { key, on } }));
}

/** Saved state for these homes, kept in sync across the page (and other tabs). */
export function useSaved(keys: string[]): [Record<string, boolean>, (key: string, where: string) => void] {
  const [saved, setState] = useState<Record<string, boolean>>({});
  const sig = keys.join(",");
  useEffect(() => {
    const read = () => setState(Object.fromEntries(keys.map((k) => [k, isSaved(k)])));
    read();
    addEventListener(EVT, read); addEventListener("storage", read);
    return () => { removeEventListener(EVT, read); removeEventListener("storage", read); };
  }, [sig]);
  const toggle = (key: string, where: string) => { const on = !isSaved(key); setState((s) => ({ ...s, [key]: on })); setSaved(key, on, where); };
  return [saved, toggle];
}
