import type { Metadata } from "next";
import type { HomeContent } from "./content/homes";

/**
 * Search + AI-search setup (Oscar, Nov 18: "prepare now, index at launch"; make the homes findable by Google, Bing,
 * ChatGPT search and Claude). ONE switch: SITE_INDEXING=on in Vercel (then redeploy) opens the public pages to search
 * engines. Until then every public page says noindex. The Vercel test address is always noindex (middleware header).
 */
export const SITE = "https://pearlheightshomes.com";
export const BRAND = "Pearl Heights Homes";
export const indexingOn = (env: NodeJS.ProcessEnv = process.env) => env.SITE_INDEXING === "on";

/** Metadata shared by indexable public pages: robots follows the switch; canonical is the real domain. */
export function publicMeta(path: string, m: Metadata): Metadata {
  const on = indexingOn();
  return {
    ...m,
    metadataBase: new URL(SITE),
    alternates: { canonical: path },
    robots: on ? { index: true, follow: true } : { index: false, follow: false },
    openGraph: { siteName: BRAND, type: "website", url: SITE + path, title: String(m.title ?? BRAND), description: m.description ?? undefined, ...(m.openGraph ?? {}) },
  };
}

/** Public paths for the sitemap (the home pages are added from the home content). */
export const PUBLIC_PATHS = ["/"];

/**
 * Structured data (schema.org) for a home page, so search engines and AI assistants can read the facts.
 * Privacy (Oscar's standing rule): never the street address, coordinates or codes: only neighborhood, city and state.
 * That means no Google "vacation rental" rich result (it requires exact coordinates), which is the intended trade-off.
 * No star-rating markup: Google doesn't show self-published review stars for lodging sites, and the reviews are shown on
 * the page itself.
 */
export function homeJsonLd(h: HomeContent) {
  const url = `${SITE}/homes/${h.slug}`;
  const faq = h.faq.length ? {
    "@type": "FAQPage",
    "@id": `${url}#faq`,
    mainEntity: h.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  } : null;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "VacationRental",
        "@id": `${url}#home`,
        name: h.title,
        url,
        description: h.summary,
        image: h.photos.slice(0, 6).map((p) => h.photoBase + p.id + ".jpg"),
        address: { "@type": "PostalAddress", addressLocality: `${h.neighborhood}, San Antonio`, addressRegion: "TX", addressCountry: "US" },
        containedInPlace: { "@type": "Place", name: `${h.neighborhood}, San Antonio, Texas` },
        containsPlace: {
          "@type": "Accommodation",
          additionalType: "EntirePlace",
          occupancy: { "@type": "QuantitativeValue", maxValue: h.capacity.guests },
          numberOfBedrooms: h.capacity.bedrooms,
          numberOfBathroomsTotal: h.capacity.baths,
          bed: h.sleeping.map((s) => ({ "@type": "BedDetails", typeOfBed: s.beds, name: s.room })),
          amenityFeature: h.topAmenities.map((a) => ({ "@type": "LocationFeatureSpecification", name: a, value: true })),
        },
        checkinTime: "16:00",
        checkoutTime: "10:00",
        petsAllowed: false,
        knowsLanguage: ["en", "es"],
        brand: { "@type": "Brand", name: BRAND },
        provider: { "@id": `${SITE}/#org` },
      },
      ...(faq ? [faq] : []),
    ],
  };
}

/** Structured data for the home page: the business and its five homes. */
export function siteJsonLd(homes: HomeContent[]) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE}/#org`,
        name: BRAND,
        url: SITE,
        email: "bookings@pearlheightshomes.com",
        description: "Five family-friendly vacation homes in San Antonio, Texas, hosted by Oscar & Fernanda.",
        areaServed: { "@type": "City", name: "San Antonio, Texas" },
        knowsLanguage: ["en", "es"],
      },
      {
        "@type": "ItemList",
        "@id": `${SITE}/#homes`,
        name: `${BRAND}: vacation homes in San Antonio`,
        itemListElement: homes.map((h, i) => ({ "@type": "ListItem", position: i + 1, url: `${SITE}/homes/${h.slug}`, name: h.title })),
      },
    ],
  };
}

/** Safe <script type="application/ld+json"> body: escapes "<" so content can't close the tag. */
export const ldJson = (o: unknown) => JSON.stringify(o).replace(/</g, "\\u003c");
