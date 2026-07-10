import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Voltix",
    short_name: "Voltix",
    description: "Digital asset, copy strategy and network rewards dashboard",
    start_url: "/",
    display: "standalone",
    background_color: "#050b08",
    theme_color: "#050b08",
    icons: [
      {
        src: "/apk-icon.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/apk-icon.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
