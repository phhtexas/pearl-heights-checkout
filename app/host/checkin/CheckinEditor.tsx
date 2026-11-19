"use client";
import { useEffect, useState } from "react";

type Home = { propertyKey: string; title: string; address: string; message: string; updatedAt: string | null };

/**
 * Oscar pastes each home's Hospitable "Check-in Inst." message here, unchanged (placeholders kept), plus the address.
 * Guests see the address after paperwork and the filled-in message from 8:00 AM CT on check-in day (live bookings).
 */
export function CheckinEditor() {
  const [homes, setHomes] = useState<Home[] | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => { fetch("/api/host/checkin").then((r) => r.json()).then((j) => j.homes ? setHomes(j.homes) : setErr(j.error ?? "Couldn't load.")).catch(() => setErr("Couldn't load.")); }, []);
  return (
    <div className="H-wrap">
      <header className="H-top"><a className="H-back" href="/host">← Inbox</a><h1>Check-in details</h1><span /></header>
      <p className="H-dim">Paste each home&apos;s Hospitable check-in message exactly as it is, placeholders included. Direct guests see the address after they sign and verify, and the full message from 8:00 AM on check-in day. Their door code is the last 4 digits of their phone (%guest_phone_last4%). Test bookings never see these details.</p>
      {err && <p className="H-err" role="alert">{err}</p>}
      {homes?.map((h) => <HomeBox key={h.propertyKey} h={h} />)}
    </div>
  );
}

function HomeBox({ h }: { h: Home }) {
  const [address, setAddress] = useState(h.address), [message, setMessage] = useState(h.message);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [preview, setPreview] = useState(""), [unknown, setUnknown] = useState<string[]>([]);
  const [saved, setSaved] = useState(h.updatedAt);
  const title = h.title || h.propertyKey;
  const dirty = address !== h.address || message !== h.message;
  const post = async (previewOnly: boolean) => {
    setState(previewOnly ? "idle" : "saving");
    const r = await fetch("/api/host/checkin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ home: h.propertyKey, address, message, preview: previewOnly }) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    if (!r?.ok) { setState("error"); return; }
    setPreview(j.preview ?? ""); setUnknown(j.unknown ?? []);
    if (!previewOnly) { setState("saved"); setSaved(new Date().toISOString()); h.address = address; h.message = message; }
  };
  const ready = !!address.trim() && !!message.trim();
  return (
    <section className="H-ci">
      <h2>{title}</h2>
      <p className="H-dim">{saved ? `Saved ${new Date(saved).toLocaleString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : "Not set yet: direct guests see “We're getting your check-in details ready.”"}</p>
      <label>Street address<input value={address} onChange={(e) => { setAddress(e.target.value); setState("idle"); }} placeholder="Street, city, ZIP" autoComplete="off" /></label>
      <label>Check-in message (from Hospitable)<textarea rows={10} value={message} onChange={(e) => { setMessage(e.target.value); setState("idle"); }} placeholder="Hi %guest_first_name%, …" spellCheck={false} /></label>
      {unknown.length > 0 && <p className="H-err">These placeholders aren&apos;t supported and will be left out: {unknown.join(", ")}</p>}
      <div className="H-ciActs">
        <button className="H-btn" type="button" disabled={!ready || state === "saving" || (!dirty && state !== "error" && !!saved)} onClick={() => post(false)}>{state === "saving" ? "Saving…" : "Save"}</button>
        <button className="H-link" type="button" disabled={!message.trim()} onClick={() => post(true)}>Preview for a sample guest</button>
        {state === "saved" && <span className="H-dim" role="status">Saved</span>}
        {state === "error" && <span className="H-err" role="alert">Couldn&apos;t save. Please try again.</span>}
      </div>
      {preview && <div className="H-ciPreview" aria-label="Preview"><p className="H-dim">Preview (sample guest, phone ending 0142):</p><pre>{preview}</pre></div>}
    </section>
  );
}
