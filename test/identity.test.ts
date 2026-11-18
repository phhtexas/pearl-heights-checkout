import { describe, expect, it, vi } from "vitest";
import { IdentityUnavailable, createIdSession, getIdState, identityClient } from "@/services/identity";

describe("Stripe Identity service", () => {
  it("refuses without a key, and refuses live keys", () => {
    expect(() => identityClient({})).toThrow(IdentityUnavailable);
    expect(() => identityClient({ STRIPE_SECRET_KEY: "sk_live_x" })).toThrow(/TEST/);
    expect(() => identityClient({ STRIPE_SECRET_KEY: "rk_test_x" })).not.toThrow();
  });
  it("creates a document + live selfie session", async () => {
    const create = vi.fn(async () => ({ id: "vs_abc12345678", client_secret: "vs_abc_secret", url: "https://verify.stripe.com/x" }));
    const s = await createIdSession({ metadata: { token: "demo" }, returnUrl: "https://x/stay/demo?id=done" }, { verificationSessions: { create } } as any);
    expect(s).toEqual({ id: "vs_abc12345678", clientSecret: "vs_abc_secret", url: "https://verify.stripe.com/x" });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ type: "document", options: { document: { require_matching_selfie: true, require_live_capture: true } } }));
  });
  it("reads only the status (no ID data), and checks the id", async () => {
    const retrieve = vi.fn(async (_id: string, _o?: unknown) => ({ id: "vs_abc12345678", status: "requires_input", livemode: false, metadata: { token: "demo" }, last_error: { code: "document_expired", reason: "x" } }));
    const st = await getIdState("vs_abc12345678", { verificationSessions: { retrieve } } as any);
    expect(st).toEqual({ id: "vs_abc12345678", status: "requires_input", testMode: true, metadata: { token: "demo" }, lastError: "document_expired" });
    expect(retrieve.mock.calls[0]![1]).toBeUndefined(); // never expands verified_outputs
    await expect(getIdState("../x", { verificationSessions: { retrieve } } as any)).rejects.toThrow();
  });
});
