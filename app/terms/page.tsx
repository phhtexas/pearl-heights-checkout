import { DocPage, draftMeta } from "../legal/parts";

/** Draft legal document page (V1.2). Text: src/content/legal/booking-terms.md. noindex + DRAFT banner via the shared shell. */
export const metadata = draftMeta("Direct Booking Terms");
export const dynamic = "force-static";

export default function Page() {
  return <DocPage id="booking-terms" />;
}
