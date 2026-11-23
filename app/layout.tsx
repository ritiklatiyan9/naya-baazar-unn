import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./atlas-theme.css";

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export const metadata: Metadata = {
  title: "Naya Baazar | Floor plans & shop availability",
  description: "Explore the ground and first floor plans, shop dimensions and architectural views of Naya Baazar, an open-air market in Unn, Shamli.",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><head><link rel="stylesheet" href="/gallery.css" /></head><body>{children}</body></html>;
}
