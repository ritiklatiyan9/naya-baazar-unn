import { routes } from "../../lib/site";
import { pageMetadata } from "../../lib/site-metadata";

export const metadata = pageMetadata(
  routes.plans,
  "Naya Baazar Floor Plans & Shop Availability | Unn, Shamli",
  "Browse both floors of Naya Baazar in Unn, Shamli. Select a shop to see its dimensions and availability, or download the original plan and size register.",
);

export default function FloorPlansPage() {
  return <section className="plan-resources" aria-labelledby="drawing-resources">
    <h2 id="drawing-resources">Shop dimensions and drawings</h2>
    <p>Ground-floor shops are numbered 1–108. First-floor shops are numbered 112–219. The size register gives the approximate internal dimensions of each shop in feet and metres.</p>
    <ul>
      <li><a href="/plans/ground.svg">View ground-floor drawing</a></li>
      <li><a href="/plans/first.svg">View first-floor drawing</a></li>
      <li><a href="/plans/naya-baazar-sizes.pdf" download>Download plans and size register (PDF)</a></li>
    </ul>
  </section>;
}
