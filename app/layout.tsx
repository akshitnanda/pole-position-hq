import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
  ? new URL(process.env.NEXT_PUBLIC_SITE_URL)
  : process.env.VERCEL_URL
    ? new URL(`https://${process.env.VERCEL_URL}`)
    : new URL("https://pole-position-hq.vercel.app");

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: {
    default: "Pole Position HQ",
    template: "%s | Pole Position HQ",
  },
  description:
    "A premium Formula 1 command center with live-feeling telemetry, timing context, fantasy trends, and a broadcast-inspired command surface.",
  applicationName: "Pole Position HQ",
  keywords: [
    "Formula 1",
    "F1 dashboard",
    "OpenF1",
    "telemetry",
    "Next.js",
    "portfolio",
  ],
  openGraph: {
    title: "Pole Position HQ",
    description:
      "Track the next session, scrub telemetry, and explore a premium F1 command center built for a stable live demo.",
    type: "website",
    images: ["/opengraph-image"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Pole Position HQ",
    description:
      "A polished F1 command center with live-feeling telemetry, timing context, and fantasy signals.",
    images: ["/twitter-image"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased" suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
