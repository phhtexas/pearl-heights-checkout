import { DocPage, draftMeta } from "../legal/parts";

/** Legal document page (V1.2). Text: src/content/legal/website-terms.md. Final since Nov 20 (Oscar: attorney approved). */
export const metadata = draftMeta("Website Terms of Use");
export const dynamic = "force-static";

export default function Page() {
  return <DocPage id="website-terms" />;
}
