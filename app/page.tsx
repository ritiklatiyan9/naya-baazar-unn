import Link from "next/link";
import plan from "../src/plan-data.json";
import { developer, routes, siteLanguage, siteName, siteUrl } from "../lib/site";
import { marketImage, pageMetadata } from "../lib/site-metadata";

const title = "Naya Baazar, Unn, Shamli | Shops & Floor Plans";
const description = `Explore Naya Baazar, an open-air market by Defence Garden in Unn, Shamli, Uttar Pradesh. See floor plans, dimensions and availability for ${plan.length} shops.`;

export const metadata = pageMetadata(routes.home, title, description);

const websiteId = siteUrl("/#website");
const marketId = siteUrl("/#market");
const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": websiteId,
      name: siteName,
      url: siteUrl(routes.home),
      inLanguage: siteLanguage,
      publisher: { "@type": "Organization", ...developer },
    },
    {
      "@type": "WebPage",
      "@id": siteUrl("/#webpage"),
      url: siteUrl(routes.home),
      name: title,
      description,
      inLanguage: siteLanguage,
      isPartOf: { "@id": websiteId },
      mainEntity: { "@id": marketId },
    },
    {
      "@type": "Place",
      "@id": marketId,
      name: siteName,
      url: siteUrl(routes.home),
      description: "An open-air market by Defence Garden in Unn, Shamli, with two floors of shops around a landscaped courtyard.",
      image: siteUrl(marketImage.url),
      address: {
        "@type": "PostalAddress",
        addressLocality: "Unn",
        addressRegion: "Uttar Pradesh",
        addressCountry: "IN",
      },
      containedInPlace: { "@type": "AdministrativeArea", name: "Shamli district" },
    },
  ],
};

export default function Page() {
  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{
      __html: JSON.stringify(structuredData).replace(/</g, "\\u003c"),
    }} />
    <section className="plan-resources" aria-labelledby="market-overview">
      <h2 id="market-overview">Shops around the courtyard</h2>
      <p>Naya Baazar brings together {plan.length} shops across two floors. Covered walkways connect the shopfronts around a landscaped central courtyard, and an internal driveway connects the market to the street.</p>
      <p>Use the <Link href={routes.plans}>floor plans</Link> to compare shop dimensions and check availability. The <Link href={routes.walkthrough}>walkthrough</Link> follows the route from the entrance to the courtyard.</p>
    </section>
  </>;
}
