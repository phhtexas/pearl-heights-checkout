import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Draft legal documents, Version 1.2 (Legal note 11, ChatGPT; checked against Oscar's decisions in Legal note 10).
 * The text lives in src/content/legal/*.md, copied from the four Google Docs. Server-only: read at build time.
 * Format: blank-line separated blocks. "## n Title" section, "### Title" subsection, "- " bullets,
 * "| a | b |" table (first row is the header), "> " sample note, anything else a paragraph.
 */
export const LEGAL_VERSION = "1.2";
export const LEGAL_UPDATED = "November 16, 2026";
export const OPERATOR = "PR Portfolio Properties LLC, doing business as Pearl Heights Homes";

export type Block =
  | { t: "h"; id: string; num: string; text: string; subs: { id: string; text: string }[] }
  | { t: "sub"; id: string; text: string }
  | { t: "p"; text: string }
  | { t: "note"; text: string }
  | { t: "ul"; items: string[] }
  | { t: "table"; head: string[]; rows: string[][] };

export interface LegalDoc { id: string; title: string; summary: string; appliesTo: string; blocks: Block[] }

const DOCS: Omit<LegalDoc, "blocks">[] = [
  { id: "booking-terms", title: "Direct Booking Terms and Cancellation Policy", summary: "How a direct reservation is paid, verified, changed and canceled, including the refund schedule.", appliesTo: "If you book a stay directly with us" },
  { id: "rental-agreement", title: "Rental Agreement and House Rules", summary: "The agreement the reservation holder signs after paying. Fields in brackets are filled in from your reservation.", appliesTo: "If you are the reservation holder" },
  { id: "privacy", title: "Privacy and Cookie Notice", summary: "What information we collect, how we use and share it, how long we keep it and your choices.", appliesTo: "If you visit the site or book" },
  { id: "website-terms", title: "Website Terms of Use", summary: "The rules for using this website, the checkout and the guest portal.", appliesTo: "If you use this website" },
];

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const cells = (line: string) => line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

export function parseLegal(id: string, src: string): Block[] {
  const out: Block[] = [];
  let section: Extract<Block, { t: "h" }> | null = null;
  for (const raw of src.trim().split(/\n\s*\n/)) {
    const block = raw.trim();
    const lines = block.split("\n");
    const h = /^## (\d+) (.+)$/.exec(block);
    if (h) { section = { t: "h", id: `${id}-${h[1]!}`, num: h[1]!, text: h[2]!, subs: [] }; out.push(section); continue; }
    if (block.startsWith("## ")) { section = { t: "h", id: `${id}-${slug(block.slice(3))}`, num: "", text: block.slice(3), subs: [] }; out.push(section); continue; }
    if (block.startsWith("### ")) {
      const sub = { t: "sub" as const, id: `${section?.id ?? id}-${slug(block.slice(4))}`, text: block.slice(4) };
      section?.subs.push({ id: sub.id, text: sub.text }); out.push(sub); continue;
    }
    if (lines.every((l) => l.startsWith("- "))) { out.push({ t: "ul", items: lines.map((l) => l.slice(2)) }); continue; }
    if (lines.every((l) => l.startsWith("|"))) { const [head = [], ...rows] = lines.map(cells); out.push({ t: "table", head, rows }); continue; }
    if (block.startsWith("> ")) { out.push({ t: "note", text: block.slice(2) }); continue; }
    out.push({ t: "p", text: lines.join(" ") });
  }
  return out;
}

export function legalDocs(): LegalDoc[] {
  return DOCS.map((d) => ({ ...d, blocks: parseLegal(d.id, readFileSync(join(process.cwd(), "src/content/legal", `${d.id}.md`), "utf8")) }));
}
