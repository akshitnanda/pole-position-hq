import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Pole Position HQ",
    short_name: "PPHQ",
    description:
      "A premium F1 command center with live-feeling telemetry, timing context, and fantasy trends.",
    start_url: "/",
    display: "standalone",
    background_color: "#f2f4f7",
    theme_color: "#e10600",
    icons: [
      {
        src: "/favicon.ico",
        sizes: "any",
        type: "image/x-icon",
      },
    ],
  };
}
