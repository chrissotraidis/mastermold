import type { MetadataRoute } from "next";

/**
 * Web app manifest: makes "Add to Home Screen" on a phone install Master Mold
 * as a standalone dark app instead of a browser tab — the on-the-go check-in
 * surface. Colors match the Void theme (globals.css --background #0f090b).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Master Mold",
    short_name: "Master Mold",
    description: "Local-first investing console with a Solana autopilot lane.",
    start_url: "/",
    display: "standalone",
    background_color: "#0f090b",
    theme_color: "#0f090b",
    icons: [
      { src: "/master-mold-icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/master-mold-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
