import type { Metadata } from "next";
import { currentHost } from "@/server/host";
import { SignIn } from "../HostClient";
import { CheckinEditor } from "./CheckinEditor";
import "../host.css";

/** Host inbox: check-in details per home (audit F1). Private; never indexed. */
export const metadata: Metadata = { title: "Check-in details | Pearl Heights Homes", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

export default async function CheckinPage() {
  const host = await currentHost();
  return <main className="H">{host ? <CheckinEditor /> : <SignIn />}</main>;
}
