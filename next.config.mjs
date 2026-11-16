/** @type {import('next').NextConfig} */
export default {
  // Put CSS in the page itself so the first paint doesn't wait on separate style files (note 150 item 4, slow-4G LCP).
  experimental: { inlineCss: true },
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
