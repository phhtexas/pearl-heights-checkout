import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentHost } from "@/server/host";
import { CardTest } from "./CardTest";
import "../host.css";

export const metadata: Metadata = { title: "Live card test | Host", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function Page() {
  if (!(await currentHost())) redirect("/host");
  return <main className="H"><CardTest /></main>;
}
