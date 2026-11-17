import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { demoStay } from "@/content/stayDemo";
import { Portal } from "./Portal";
import "../stay.css";

/**
 * Guest portal (Oscar, Nov 17): a guest's private stay page, opened from the link in their confirmation.
 * Phase 1 = TEST DATA ONLY (/stay/demo). The agreement signing and ID check are placeholders until the e-signature and
 * ID-check services are chosen; messages are not sent anywhere yet. Never indexed.
 */
export const metadata: Metadata = { title: "Your stay | Pearl Heights Homes", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function StayPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  // The sample reservation exists only in sandbox builds (NEXT_PUBLIC_SANDBOX=true); real reservations come later
  // (database + unguessable token). Without the flag, /stay/demo is a 404.
  if (token !== "demo" || process.env.NEXT_PUBLIC_SANDBOX !== "true") notFound();
  return <Portal stay={demoStay()} />;
}
