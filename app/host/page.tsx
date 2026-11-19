import type { Metadata } from "next";
import { currentHost } from "@/server/host";
import { Inbox, SignIn } from "./HostClient";
import "./host.css";

/** Host inbox (Oscar, Nov 19): guest chat threads from the stay pages. Private; never indexed. */
export const metadata: Metadata = { title: "Host inbox | Pearl Heights Homes", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

export default async function HostPage() {
  const host = await currentHost();
  return <main className="H">{host ? <Inbox /> : <SignIn />}</main>;
}
