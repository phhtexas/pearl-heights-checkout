import { headers } from "next/headers";
import type { Guide } from "./content/guides";

/** Draft guides are visible only off the real domain (the Vercel test site); pearlheightshomes.com shows approved ones. */
export async function guideVisible(g: Guide): Promise<boolean> {
  if (g.approved) return true;
  const host = ((await headers()).get("host") ?? "").toLowerCase().split(":")[0]!;
  return !/(^|\.)pearlheightshomes\.com$/.test(host);
}
