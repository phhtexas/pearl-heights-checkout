import { DocPage, draftMeta } from "../legal/parts";

/** Draft legal document page (V1.2). Text: src/content/legal/rental-agreement.md. noindex + DRAFT banner via the shared shell. */
export const metadata = draftMeta("Rental Agreement");
export const dynamic = "force-static";

export default function Page() {
  return <DocPage id="rental-agreement" />;
}
