import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentHost } from "@/server/host";
import { InquiryThread } from "../../HostClient";
import "../../host.css";

/** A question before booking, for the signed-in host (Oscar, Nov 19). */
export const metadata: Metadata = { title: "Question | Host inbox", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

export default async function HostInquiry({ params }: { params: Promise<{ id: string }> }) {
  if (!(await currentHost())) redirect("/host");
  return <main className="H"><InquiryThread id={(await params).id} /></main>;
}
