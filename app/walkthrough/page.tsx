import { routes } from "../../lib/site";
import { pageMetadata, walkthrough } from "../../lib/site-metadata";
import { ProjectWalkthrough } from "../ProjectMedia";

export const metadata = pageMetadata(
  routes.walkthrough,
  "Naya Baazar Walkthrough Video | Unn, Shamli",
  walkthrough.description,
);

export default function WalkthroughPage() {
  return <div className="feature-media"><ProjectWalkthrough /></div>;
}
