import { permanentRedirect } from "next/navigation";

/** V2 became the listing page (Oscar, Nov 16, 2026); old /v2 review links go to the main address. V1 is archived in Git
 *  (branch archive/listing-736-v1-optionA). */
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  permanentRedirect(`/homes/${(await params).slug}`);
}
