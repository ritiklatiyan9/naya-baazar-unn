import { routes } from "../../lib/site";
import { pageMetadata } from "../../lib/site-metadata";
import { ProjectDetails } from "../ProjectFeatures";

export const metadata = pageMetadata(
  routes.details,
  "Naya Baazar Project Details | Defence Garden, Unn, Shamli",
  "Learn about Defence Garden’s Naya Baazar project in Unn, Shamli, Uttar Pradesh, with two levels of shops, covered walkways and a landscaped central plaza.",
);

export default function ProjectDetailsPage() {
  return <ProjectDetails />;
}
