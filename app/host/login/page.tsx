import type { Metadata } from "next";
import { Redeem, SignIn } from "../HostClient";
import "../host.css";

/** Opened from the emailed sign-in link. A tap on "Sign in" uses the link, so email scanners that open links can't. */
export const metadata: Metadata = { title: "Sign in | Host inbox", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

export default async function HostLogin({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const t = (await searchParams).t ?? "";
  return <main className="H">{/^[A-Za-z0-9_-]{40,64}$/.test(t) ? <Redeem token={t} /> : <SignIn />}</main>;
}
