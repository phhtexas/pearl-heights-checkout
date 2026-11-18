import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { HOMES } from "@/content/homes";
import { PROPERTIES } from "@/domain/properties";
import { policyOverview } from "@/domain/policy";
import { ListingV2 } from "../ListingV2";
import { homeJsonLd, ldJson, publicMeta } from "@/seo";

const bySlug = (slug: string) => Object.values(HOMES).find((h) => h.slug === slug);

export function generateStaticParams() { return Object.values(HOMES).map((h) => ({ slug: h.slug })); }

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const h = bySlug((await params).slug);
  return h ? publicMeta(`/homes/${h.slug}`, { title: `${h.title} | Pearl Heights Homes`, description: h.summary, openGraph: { images: [h.photoBase + h.photos[0]!.id + ".jpg"] } }) : {};
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const home = bySlug((await params).slug);
  if (!home) notFound();
  const p = PROPERTIES.find((x) => x.key === home.key)!;
  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(homeJsonLd(home)) }} />
    <ListingV2 home={home} prop={{ key: p.key, name: p.name, maxGuests: p.maxGuests, extraGuestFrom: p.extraGuestFrom, extraGuestFee: p.extraGuestFee }} policy={policyOverview()} />
  </>;
}
