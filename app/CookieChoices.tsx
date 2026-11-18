"use client";
/** Footer "Cookie choices" link: reopens the cookie banner so a visitor can change or withdraw consent (Privacy Notice §7). */
export function CookieChoices({ className }: { className?: string }) {
  return <button type="button" className={`PH-cookieLink ${className ?? ""}`} onClick={() => window.dispatchEvent(new Event("ph-cookie-choices"))}>Cookie choices</button>;
}
