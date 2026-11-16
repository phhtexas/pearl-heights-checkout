/** @type {import('next').NextConfig} */
export default {
  images: {
    // Listing photos come from the home's Hospitable direct-booking gallery.
    // Host profile photo comes from the hosts' Airbnb profile (via Hospitable's listing data).
    remotePatterns: [
      { protocol: "https", hostname: "assets.hospitable.com", pathname: "/property_images/**" },
      { protocol: "https", hostname: "a0.muscache.com", pathname: "/im/pictures/user/**" },
    ],
    formats: ["image/avif", "image/webp"],
  },
};
