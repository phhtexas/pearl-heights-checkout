import { DocPage, draftMeta } from "../legal/parts";

/** Legal document page (V1.2). Text: src/content/legal/booking-terms.md. Final since Nov 20 (Oscar: attorney approved). */
export const metadata = draftMeta("Direct Booking Terms");
export const dynamic = "force-static";

export default function Page() {
  return <DocPage id="booking-terms" />;
}
