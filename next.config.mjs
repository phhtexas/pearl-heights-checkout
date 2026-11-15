/** @type {import('next').NextConfig} */
export default {
  images: {
    // Listing photos come from the home's Hospitable direct-booking gallery.
    remotePatterns: [{ protocol: "https", hostname: "assets.hospitable.com", pathname: "/property_images/**" }],
    formats: ["image/avif", "image/webp"],
  },
};
