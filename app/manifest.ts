import type { MetadataRoute } from "next";

// Android Chrome only offers "Install app" with 192px and 512px PNG icons.
// "?v=2": a changed icon address tells installed Android apps to swap in the new icon (the mascot).
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "My Office Bot",
    short_name: "Office Bot",
    description: "Instant lead alerts for home service pros.",
    // The installed app opens on the real dashboard (signed-out people are sent to sign in).
    start_url: "/app",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      { src: "/icons/icon-192.png?v=2", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png?v=2", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-192.png?v=2", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png?v=2", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
