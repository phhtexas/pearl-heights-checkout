import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { stayForToken } from "@/server/stay";
import { Portal } from "./Portal";
import "../stay.css";

/**
 * Guest portal: a guest's private stay page, opened from the link on their confirmation screen (email later).
 *  - /stay/demo: the sample reservation, sandbox builds only.
 *  - /stay/<token>: a real booking (Oscar, Nov 17), looked up by the token's hash (src/services/stayLinks.ts).
 *    Unknown, expired or revoked links are a 404 that says nothing about whether a booking exists.
 * Never indexed; no caching; the referrer is never sent, so the token can't leak to other sites.
 */
export const metadata: Metadata = { title: "Your stay | Pearl Heights Homes", description: "Your booking details, required steps, arrival information and messages with Oscar & Fernanda.", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

export default async function StayPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const stay = await stayForToken(token);
  if (!stay) notFound();
  return <Portal stay={stay} />;
}
