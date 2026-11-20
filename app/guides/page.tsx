import type { Metadata } from "next";
import { GUIDES } from "@/content/guides";
import { publicMeta } from "@/seo";
import { guideVisible } from "@/guidesAccess";
import { SiteNav } from "../SiteNav";
import "./guides.css";

export const dynamic = "force-dynamic";
const base = publicMeta("/guides", { title: "Guides | Pearl Heights Homes", description: "Family travel guides to San Antonio neighborhoods near our homes, written by your hosts Oscar & Fernanda.", openGraph: { images: [GUIDES[0]!.hero.src] } });
// Indexed only once at least one guide is approved (no empty "coming soon" page in search).
export const metadata: Metadata = GUIDES.some((g) => g.approved) ? base : { ...base, robots: { index: false, follow: false } };

export default async function Page() {
  const shown = [];
  for (const g of GUIDES) if (await guideVisible(g)) shown.push(g);
  return (
    <div className="G-page">
      <SiteNav />
      <main className="G-main">
        <h1>Guides</h1>
        <p className="G-lead">Neighborhood guides for families visiting San Antonio, written by your hosts, Oscar &amp; Fernanda.</p>
        {shown.length ? (
          <ul className="G-index">
            {shown.map((g) => <li key={g.slug}><a href={`/guides/${g.slug}`}><strong>{g.title}{g.approved ? "" : " (draft)"}</strong><span>{g.description}</span></a></li>)}
          </ul>
        ) : <p>Guides are coming soon.</p>}
      </main>
    </div>
  );
}
