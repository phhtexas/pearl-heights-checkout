import { DocPage, draftMeta } from "../legal/parts";

/** Draft legal document page (V1.2). Text: src/content/legal/website-terms.md. noindex + DRAFT banner via the shared shell. */
export const metadata = draftMeta("Website Terms of Use");
export const dynamic = "force-static";

export default function Page() {
  return <DocPage id="website-terms" />;
}
