import type { MetadataRoute } from "next";

// Android Chrome only offers "Install app" with 192px and 512px PNG icons.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "My Office Bot",
    short_name: "Office Bot",
    description: "Instant lead alerts for home service pros.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
