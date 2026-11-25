import { routes } from "../../lib/site";
import { pageMetadata } from "../../lib/site-metadata";
import { ProjectGallery } from "../ProjectMedia";

export const metadata = pageMetadata(
  routes.gallery,
  "Naya Baazar Architectural Gallery | Unn, Shamli",
  "See architectural renderings of Naya Baazar in Unn, Shamli, including the street entrance, covered shopping arcades and landscaped courtyard.",
);

export default function GalleryPage() {
  return <div className="feature-media"><ProjectGallery /></div>;
}
