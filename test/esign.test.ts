import { describe, expect, it, vi } from "vitest";
import { agreementHtml } from "@/services/esign/agreement";
import { ESignUnavailable, createSigningDocument, getDocumentStatus } from "@/services/esign/signwell";

const base = {
  bookingId: "PH-TEST-0001", propertyKey: "752", holder: { name: "Test Guest", email: "test-guest@example.com" },
  checkIn: "2027-01-12", checkOut: "2027-01-15", guests: { adults: 2, children: 2, infants: 0 },
  price: { total: "$1,000.00", paidNow: "$500.00", balance: "$500.00", balanceDate: "Dec 13, 2026" },
};

describe("rental agreement HTML for SignWell", () => {
  it("test mode fills every merge field and adds the signing tags", () => {
    const html = agreementHtml({ ...base, testMode: true });
    expect(html).not.toMatch(/\[[^\]]{2,60}\]/);                 // no [placeholders] left
    expect(html).toContain("{{s:1:y:::signature:340:64}}");                           // signature
    expect(html).toContain("{{t:1:y:Full legal name:" + base.holder.name + ":legal_name:340:40}}"); // editable name, prefilled
    expect(html).toContain("{{af_d_s:1:y:::date_signed:200:40}}");                        // date signed
    expect(html).not.toContain("{{c:");                            // no checkboxes (Oscar: confirmed by signing)
    expect(html).toContain("By signing below, I confirm that:");
    expect(html).toContain("TEST DOCUMENT");
    expect(html).toContain("Test Guest");
    expect(html).toContain("Scheduled balance $500.00 on Dec 13, 2026");
    expect(html).toMatch(/Property address<\/td><td>Released after agreement and identity verification: shown in the guest portal/);
  });
  it("live mode never produces an agreement with gaps (blocked or complete, never partial)", () => {
    for (const key of ["736", "752", "indianola", "edgewood", "claywell"]) {
      let html = "";
      try { html = agreementHtml({ ...base, bookingId: "PH-A7K2QX", propertyKey: key, urgentContact: "(210) 400-2540", testMode: false }); } catch (e) { expect(String(e)).toMatch(/blocked|Unfilled/i); continue; }
      expect(html).not.toMatch(/\[[^\]]{2,60}\]/);
      expect(html).not.toContain("TEST");
    }
  });
  it("keeps the name tag intact (no colons or braces from the name)", async () => {
    const { legalNameTag } = await import("@/services/esign/agreement");
    expect(legalNameTag("Ana: {Ruiz}").trim()).toBe("{{t:1:y:Full legal name:Ana Ruiz:legal_name:340:40}}");
  });
  it("escapes the guest's name", () => {
    expect(agreementHtml({ ...base, holder: { name: "A <b>B</b>", email: "x@example.com" }, testMode: true })).toContain("A &lt;b&gt;B&lt;/b&gt;");
  });
});

describe("SignWell client", () => {
  it("refuses without a key", async () => {
    await expect(createSigningDocument({ name: "x", html: "<p>x</p>", signer: { name: "A", email: "a@example.com" }, testMode: true, metadata: {} }, {})).rejects.toBeInstanceOf(ESignUnavailable);
  });
  it("creates an embedded, test-mode document from HTML and returns the signing URL", async () => {
    const f = vi.fn(async (_u: string, init: RequestInit) => new Response(JSON.stringify({ id: "a692e1ce-9929-4541-adc7-61932bab39d3", recipients: [{ id: "1", embedded_signing_url: "https://www.signwell.com/docs/abc/" }] }), { status: 201 }));
    const r = await createSigningDocument({ name: "x", html: "<p>hi</p>", signer: { name: "A", email: "a@example.com" }, testMode: true, metadata: { token: "demo" } }, { SIGNWELL_API_KEY: "k" }, f as any);
    expect(r.embeddedSigningUrl).toBe("https://www.signwell.com/docs/abc/");
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe("https://www.signwell.com/api/v1/documents");
    expect((init.headers as Record<string, string>)["X-Api-Key"]).toBe("k");
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ test_mode: true, embedded_signing: true, text_tags: true, recipients: [{ id: "1", name: "A", email: "a@example.com" }] });
    expect(Buffer.from(body.files[0].file_base64, "base64").toString()).toBe("<p>hi</p>");
  });
  it("reads completion from the API", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ id: "a692e1ce-9929-4541-adc7-61932bab39d3", status: "Completed", test_mode: true, metadata: { token: "demo" } })));
    const s = await getDocumentStatus("a692e1ce-9929-4541-adc7-61932bab39d3", { SIGNWELL_API_KEY: "k" }, f as any);
    expect(s).toMatchObject({ completed: true, testMode: true, metadata: { token: "demo" } });
    const g = vi.fn(async () => new Response(JSON.stringify({ id: "a692e1ce-9929-4541-adc7-61932bab39d3", status: "Completed", test_mode: true, metadata: {}, fields: [[{ api_id: "sig", type: "signature" }, { api_id: "legal_name", type: "text", value: " Oscar Peña " }]] })));
    expect((await getDocumentStatus("a692e1ce-9929-4541-adc7-61932bab39d3", { SIGNWELL_API_KEY: "k" }, g as any)).legalName).toBe("Oscar Peña");
    await expect(getDocumentStatus("../x", { SIGNWELL_API_KEY: "k" }, f as any)).rejects.toThrow();
  });
});
