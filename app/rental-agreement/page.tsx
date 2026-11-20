import { DocPage, draftMeta } from "../legal/parts";

/** Legal document page (V1.2). Text: src/content/legal/rental-agreement.md. Final since Nov 20 (Oscar: attorney approved). */
export const metadata = draftMeta("Rental Agreement");
export const dynamic = "force-static";

export default function Page() {
  return <DocPage id="rental-agreement" />;
}
