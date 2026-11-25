import type { Metadata } from "next";
import { routes, siteName, siteUrl } from "./site";

export const marketImage = {
  url: "/media/render-08.webp",
  width: 1672,
  height: 941,
  alt: "Architectural rendering of the Naya Baazar market street in Unn, Shamli",
};

export const walkthrough = {
  title: "Naya Baazar architectural walkthrough",
  description: "Follow the drive past the shopfronts and covered walkways into the central courtyard at Naya Baazar in Unn, Shamli.",
  video: "/media/walkthrough.mp4?v=steady-2",
  poster: "/media/render-14.webp",
  duration: 33,
};

export function pageMetadata(path: typeof routes[keyof typeof routes], title: string, description: string): Metadata {
  return {
    title,
    description,
    alternates: { canonical: siteUrl(path) },
    openGraph: {
      type: "website",
      siteName,
      locale: "en_IN",
      url: siteUrl(path),
      title,
      description,
      images: [marketImage],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [{ url: marketImage.url, alt: marketImage.alt }],
    },
  };
}
