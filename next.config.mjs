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
      // Old WordPress site (pages listed from its REST API on WP Engine, Nov 18) -> the matching new page, so old links
      // and bookmarks still land somewhere useful. Temporary (307) until the site is opened to Google at launch.
      ...[
        ["/guest/steps-away-from-pearl-riverwalk", "/homes/752-myrtle"],
        ["/guest/large-family-house-next-to-the-pearl", "/homes/736-myrtle"],
        ["/guest/alamo-heights-home", "/homes/edgewood-alamo-heights"],
        ["/guest", "/"],
        ["/privacy-policy", "/privacy"],
        ["/terms-and-conditions", "/terms"],
        ["/website-terms-promotions-policy", "/website-terms"],
        ["/house-rules", "/rental-agreement"],
        ["/frequently-asked-questions", "/#faq"],
        ["/meet-your-hosts", "/"],
        ["/san-antonio-vaction-homes", "/"],
        ["/our-blog", "/"],
        ["/thank-you-email", "/"],
        ["/booking-form", "/"],
        ["/wp-booking-calendar", "/"],
        ["/wpbc-booking-payment-failed", "/"], ["/wpbc-booking-payment-successful", "/"], ["/wpbc-my-bookings-listing", "/"], ["/wpbc-my-booking", "/"], ["/wpbc-booking-received", "/"],
        ["/my-account", "/"], ["/my-account-2", "/"],
        ["/checkout", "/"], ["/checkout-2", "/"],
        ["/cart", "/"], ["/cart-2", "/"],
        ["/shop", "/"],
      ].flatMap(([from, to]) => [{ source: from, destination: to, permanent: false }, { source: from + "/", destination: to, permanent: false }]),
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
