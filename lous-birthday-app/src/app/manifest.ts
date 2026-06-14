import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Lou's Drinks Menu",
    short_name: "Lou's Drinks",
    description: "Bestil drinks til festen",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#590d22",
    theme_color: "#590d22",
    icons: [
      {
        src: "/pwa-icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
