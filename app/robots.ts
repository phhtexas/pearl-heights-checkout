import type { MetadataRoute } from "next";
import { SITE, indexingOn } from "@/seo";

/**
 * robots.txt. Off (before launch): crawling is allowed so search engines can read each page's noindex, nothing is listed.
 * On (SITE_INDEXING=on): all search and AI-search crawlers (Googlebot, Bingbot, OAI-SearchBot for ChatGPT search,
 * Claude's search crawler, PerplexityBot...) may read the public pages; private and test areas stay closed.
 */
export default function robots(): MetadataRoute.Robots {
  const closed = ["/api/", "/stay/", "/m/", "/host", "/mockups/", "/all-homes/archive/", "/legal"]; // /m/ = private guest conversations
  return indexingOn()
    ? { rules: [{ userAgent: "*", allow: "/", disallow: closed }], sitemap: `${SITE}/sitemap.xml`, host: SITE }
    : { rules: [{ userAgent: "*", allow: "/", disallow: closed }] };
}
