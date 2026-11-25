import type { Metadata, Viewport } from "next";
import { siteLanguage, siteName, siteOrigin } from "../lib/site";
import ProjectAtlas from "./ProjectAtlas";
import "./globals.css";
import "./atlas-theme.css";

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin),
  applicationName: siteName,
  icons: { icon: "/favicon.svg" },
  robots: { "max-image-preview": "large" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang={siteLanguage}><body><ProjectAtlas>{children}</ProjectAtlas></body></html>;
}
