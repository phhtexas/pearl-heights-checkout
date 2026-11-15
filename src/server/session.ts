import { NextResponse } from "next/server";

/** Anonymous tester session (cookie) so each browser gets its own mock calendar. Holds no personal data. */
export const SESSION_COOKIE = "phh_test_session";

export function readSession(req: Request): { id: string; isNew: boolean } {
  const m = /(?:^|;\s*)phh_test_session=([A-Za-z0-9_-]{16,64})/.exec(req.headers.get("cookie") ?? "");
  if (m?.[1]) return { id: m[1], isNew: false };
  const id = Array.from(crypto.getRandomValues(new Uint8Array(18)), (b) => b.toString(16).padStart(2, "0")).join("");
  return { id, isNew: true };
}

export function withSession<T extends NextResponse>(res: T, s: { id: string; isNew: boolean }): T {
  if (s.isNew) res.cookies.set(SESSION_COOKIE, s.id, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 });
  return res;
}
