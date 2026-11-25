import type { MetadataRoute } from "next";
import { routes, siteUrl } from "../lib/site";
import { walkthrough } from "../lib/site-metadata";

export default function sitemap(): MetadataRoute.Sitemap {
  return Object.values(routes).map((path) => ({
    url: siteUrl(path),
    ...(path === routes.walkthrough && {
      videos: [{
        title: walkthrough.title,
        description: walkthrough.description,
        thumbnail_loc: siteUrl(walkthrough.poster),
        content_loc: siteUrl(walkthrough.video),
        duration: walkthrough.duration,
      }],
    }),
  }));
}
