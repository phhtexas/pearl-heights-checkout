import type { MetadataRoute } from "next";
import { HOMES } from "@/content/homes";
import { PUBLIC_PATHS, SITE } from "@/seo";

/** sitemap.xml: the home page and the five home pages (guides get added here as they're published). */
export default function sitemap(): MetadataRoute.Sitemap {
  const homes = Object.values(HOMES).map((h) => ({ url: `${SITE}/homes/${h.slug}`, changeFrequency: "weekly" as const, priority: 0.9 }));
  return [...PUBLIC_PATHS.map((p) => ({ url: SITE + p, changeFrequency: "weekly" as const, priority: 1 })), ...homes];
}
