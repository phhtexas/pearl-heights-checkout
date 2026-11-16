import { permanentRedirect } from "next/navigation";

/** Option A is now the listing page; old /a links (shared during review) go to the main address. */
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  permanentRedirect(`/homes/${(await params).slug}`);
}
