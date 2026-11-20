import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { inquiryForToken } from "@/services/inquiries";
import { Conversation } from "./Conversation";

/**
 * A guest's private conversation with us before booking (Oscar, Nov 19). Looked up by the link's hash; unknown or
 * expired links are a generic 404. Never indexed; the referrer is never sent, so the link can't leak to other sites.
 */
export const metadata: Metadata = { title: "Your conversation | Pearl Heights Homes", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

export default async function ConversationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = getDb();
  if (!db || !(await inquiryForToken(db, token).catch(() => null))) notFound();
  return <main><Conversation token={token} /></main>;
}
