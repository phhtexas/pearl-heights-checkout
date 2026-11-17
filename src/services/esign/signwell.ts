/**
 * SignWell e-signature (Oscar approved Nov 17, Sheet note 201). Server-only: the API key is SIGNWELL_API_KEY in Vercel.
 * Docs (read Nov 17, 2026): POST /api/v1/documents with files[].file_base64 (text/html accepted), text_tags,
 * embedded_signing, test_mode (not billed, not legally binding); recipients[].embedded_signing_url in the response;
 * GET /api/v1/documents/{id}; auth header X-Api-Key. Webhooks sign only "type@time" (HMAC-SHA256 with the webhook id),
 * so we never trust an event or the browser's "completed" callback on its own: we re-read the document from the API.
 */
const BASE = "https://www.signwell.com/api/v1";

export class ESignUnavailable extends Error { name = "ESignUnavailable"; }

export interface SigningDoc { documentId: string; embeddedSigningUrl: string }
export interface DocStatus { id: string; status: string; completed: boolean; testMode: boolean; signedAt?: string; metadata: Record<string, string>; legalName?: string }

function key(env: Record<string, string | undefined>): string {
  const k = env.SIGNWELL_API_KEY?.trim();
  if (!k) throw new ESignUnavailable("SIGNWELL_API_KEY is not set");
  return k;
}

async function call(path: string, init: RequestInit, env: Record<string, string | undefined>, fetchFn: typeof fetch): Promise<any> {
  const res = await fetchFn(`${BASE}${path}`, { ...init, headers: { "X-Api-Key": key(env), "Content-Type": "application/json", Accept: "application/json", ...(init.headers ?? {}) }, cache: "no-store" });
  const text = await res.text();
  let body: any = null; try { body = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
  if (!res.ok) throw new Error(`SignWell ${init.method ?? "GET"} ${path} failed: ${res.status} ${text.slice(0, 300)}`);
  return body;
}

export async function createSigningDocument(o: {
  name: string; html: string; signer: { name: string; email: string }; testMode: boolean; metadata: Record<string, string>; redirectUrl?: string;
}, env: Record<string, string | undefined> = process.env, fetchFn: typeof fetch = fetch): Promise<SigningDoc> {
  const body = {
    test_mode: o.testMode,
    name: o.name,
    files: [{ name: "rental-agreement.html", file_base64: Buffer.from(o.html, "utf8").toString("base64") }],
    recipients: [{ id: "1", name: o.signer.name, email: o.signer.email }],
    text_tags: true,
    embedded_signing: true,
    embedded_signing_notifications: false,
    allow_decline: false,
    allow_reassign: false,
    with_signature_page: false,
    custom_requester_name: "Pearl Heights Homes",
    metadata: o.metadata,
    ...(o.redirectUrl ? { redirect_url: o.redirectUrl } : {}),
  };
  const doc = await call("/documents", { method: "POST", body: JSON.stringify(body) }, env, fetchFn);
  const url = doc?.recipients?.[0]?.embedded_signing_url;
  if (!doc?.id || !url) throw new Error("SignWell did not return an embedded signing URL");
  return { documentId: String(doc.id), embeddedSigningUrl: String(url) };
}

export async function getDocumentStatus(id: string, env: Record<string, string | undefined> = process.env, fetchFn: typeof fetch = fetch): Promise<DocStatus> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Bad document id");
  const d = await call(`/documents/${id}`, { method: "GET" }, env, fetchFn);
  const status = String(d?.status ?? "");
  const legalName = fieldValue(d?.fields, "legal_name");
  return { id: String(d?.id ?? id), status, completed: /^complet/i.test(status), testMode: !!d?.test_mode, signedAt: d?.updated_at ?? undefined, metadata: (d?.metadata ?? {}) as Record<string, string>, ...(legalName ? { legalName } : {}) };
}

/** A filled field's value by api_id. SignWell nests fields per file (arrays of arrays), so search the whole tree. */
export function fieldValue(fields: unknown, apiId: string): string | undefined {
  const stack: unknown[] = [fields];
  while (stack.length) {
    const x = stack.pop();
    if (Array.isArray(x)) { stack.push(...x); continue; }
    if (x && typeof x === "object") {
      const f = x as Record<string, unknown>;
      if (f.api_id === apiId && typeof f.value === "string" && f.value.trim()) return f.value.trim().slice(0, 120);
    }
  }
  return undefined;
}

/** The signed PDF (with SignWell's audit page). Only for completed documents. */
export async function getCompletedPdf(id: string, env: Record<string, string | undefined> = process.env, fetchFn: typeof fetch = fetch): Promise<ArrayBuffer> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Bad document id");
  const res = await fetchFn(`${BASE}/documents/${id}/completed_pdf?audit_page=true`, { headers: { "X-Api-Key": key(env), Accept: "application/pdf" }, cache: "no-store" });
  if (!res.ok) throw new Error(`SignWell completed_pdf failed: ${res.status}`);
  return res.arrayBuffer();
}
