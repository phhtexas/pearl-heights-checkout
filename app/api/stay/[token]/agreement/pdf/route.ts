import { NextResponse } from "next/server";
import { ESignUnavailable, getCompletedPdf, getDocumentStatus } from "@/services/esign/signwell";
import { paperworkFor } from "@/server/stay";

/** "Download a copy (PDF)" of the signed agreement (demo portal or a real booking in test mode); the document must belong to it and be completed. */
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const doc = new URL(req.url).searchParams.get("doc") ?? "";
  const ctx = /^[0-9a-f-]{36}$/i.test(doc) ? await paperworkFor(token) : null;
  if (!ctx) return NextResponse.json({ error: "Not found" }, { status: 404, headers: noStore });
  try {
    const s = await getDocumentStatus(doc);
    if ((s.metadata?.stay ?? (s.metadata?.token === "demo" ? "demo" : undefined)) !== (ctx.kind === "demo" ? "demo" : ctx.row.bookingId) || !s.completed) return NextResponse.json({ error: "Not found" }, { status: 404, headers: noStore });
    const pdf = await getCompletedPdf(doc);
    return new NextResponse(pdf, { headers: { ...noStore, "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="rental-agreement-${s.metadata.booking ?? "signed"}.pdf"` } });
  } catch (e) {
    if (e instanceof ESignUnavailable) return NextResponse.json({ error: "Signing isn't set up yet." }, { status: 503, headers: noStore });
    console.error("[stay/agreement/pdf]", (e as Error).message);
    return NextResponse.json({ error: "We couldn't get the PDF." }, { status: 502, headers: noStore });
  }
}
