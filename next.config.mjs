/** @type {import('next').NextConfig} */
export default {
  // Put CSS in the page itself so the first paint doesn't wait on separate style files (note 150 item 4, slow-4G LCP).
  experimental: { inlineCss: true },
  // Mockups A and B were archived (Oscar, Nov 16); old links still work.
  // Mockup E's original static file (Nov 16, factual fixes only), kept for reference; the archived live E is app/all-homes/archive/e.
  async rewrites() {
    return [{ source: "/all-homes/archive/e-static", destination: "/mockups/e/index.html" }];
  },
  async headers() {
    return [{ source: "/mockups/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] }];
  },
  async redirects() {
    return [
      { source: "/all-homes/a", destination: "/all-homes/archive/a", permanent: false },
      { source: "/all-homes/b", destination: "/all-homes/archive/b", permanent: false },
      // C and E archived (Oscar, Nov 17): work continues on F only; old links still work.
      { source: "/all-homes/c", destination: "/all-homes/archive/c", permanent: false },
      { source: "/all-homes/e", destination: "/all-homes/archive/e", permanent: false },
    ];
  },
  images: {
    // Listing photos come from the home's Hospitable direct-booking gallery.
    // Host photo is self-hosted in /public (note 155), so no Airbnb CDN.
    remotePatterns: [
      { protocol: "https", hostname: "assets.hospitable.com", pathname: "/property_images/**" },
    ],
    formats: ["image/avif", "image/webp"],
    qualities: [60, 75],
  },
};
