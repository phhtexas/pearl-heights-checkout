import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { HOMES } from "@/content/homes";
import { PROPERTIES } from "@/domain/properties";
import { policyOverview } from "@/domain/policy";
import { ListingA } from "../../ListingA";

/** Listing option A (comparison prototype). Preview only; not linked from anywhere. */
const bySlug = (slug: string) => Object.values(HOMES).find((h) => h.slug === slug);

export function generateStaticParams() { return Object.values(HOMES).map((h) => ({ slug: h.slug })); }

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const h = bySlug((await params).slug);
  return h ? { title: `${h.title} (option A) | Pearl Heights Homes`, description: h.summary, robots: { index: false } } : {};
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const home = bySlug((await params).slug);
  if (!home) notFound();
  const p = PROPERTIES.find((x) => x.key === home.key)!;
  return <ListingA home={home} prop={{ key: p.key, name: p.name, maxGuests: p.maxGuests, extraGuestFrom: p.extraGuestFrom, extraGuestFee: p.extraGuestFee }} policy={policyOverview()} />;
}
