import { cookies } from "next/headers";
import { getDb } from "@/db/client";
import { HOST_COOKIE, hostForSession } from "@/services/stayChat";

/** The signed-in host's email for this request (host inbox cookie), or null. Server-only. */
export async function currentHost(): Promise<string | null> {
  const db = getDb();
  if (!db) return null;
  const c = (await cookies()).get(HOST_COOKIE)?.value;
  return hostForSession(db, c).catch(() => null);
}
