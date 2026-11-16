import { describe, expect, it } from "vitest";
import { legalDocs, parseLegal } from "../src/content/legal";

describe("draft legal documents (V1.2)", () => {
  const docs = legalDocs();
  it("has the four documents, each with numbered sections", () => {
    expect(docs.map((d) => d.id)).toEqual(["booking-terms", "rental-agreement", "privacy", "website-terms"]);
    for (const d of docs) expect(d.blocks.filter((b) => b.t === "h").length).toBeGreaterThan(10);
  });
  it("section ids are unique across the page", () => {
    const ids = docs.flatMap((d) => d.blocks.flatMap((b) => (b.t === "h" || b.t === "sub" ? [b.id] : [])));
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("keeps Oscar's confirmed decisions", () => {
    const all = docs.map((d) => d.blocks.map((b) => JSON.stringify(b)).join(" ")).join(" ");
    for (const must of ["$79 damage waiver providing up to $5,000", "72-hour cure period begins at the first decline", "in the morning of check-in day",
      "Late checkout is handled case by case", "Pay in full is the default", "120 days", "10 days after departure", "$25 handling charge",
      "through the guest portal or by email", "at least 25 years old"]) expect(all).toContain(must);
  });
  it("never makes banned claims or names the waiver vendor", () => {
    const all = JSON.stringify(docs).toLowerCase();
    for (const bad of ["no fees", "skip the cleaning fee", "best rate", "5% less", "cheaper than airbnb", "waivo", "#1", "1515"]) expect(all).not.toContain(bad);
  });
  it("parses tables, bullets and subsections", () => {
    const b = parseLegal("x", "## 1 One\n\n### Sub\n\n- a\n- b\n\n| H1 | H2 |\n| r1 | v1 |\n\nPara");
    expect(b.map((x) => x.t)).toEqual(["h", "sub", "ul", "table", "p"]);
    expect(b[3]).toMatchObject({ head: ["H1", "H2"], rows: [["r1", "v1"]] });
  });
});
