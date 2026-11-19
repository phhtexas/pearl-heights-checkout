import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentHost } from "@/server/host";
import { Thread } from "../../HostClient";
import "../../host.css";

export const metadata: Metadata = { title: "Conversation | Host inbox", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

export default async function HostThread({ params }: { params: Promise<{ id: string }> }) {
  if (!(await currentHost())) redirect("/host");
  return <main className="H"><Thread id={(await params).id} /></main>;
}
