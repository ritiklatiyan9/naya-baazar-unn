import Link from "next/link";
import plan from "../src/plan-data.json";
import { developer, enquiry, routes, siteLanguage, siteName, siteUrl } from "../lib/site";
import { marketImage, pageMetadata } from "../lib/site-metadata";
import { Icon } from "./icons";
import { MarketFacts } from "./MarketFacts";
import "./home.css";

const title = "Naya Baazar, Unn, Shamli | Shops & Floor Plans";
const description = `Explore Naya Baazar, an open-air market by Defence Garden in Unn, Shamli, Uttar Pradesh. See floor plans, dimensions and availability for ${plan.length} shops.`;

export const metadata = pageMetadata(routes.home, title, description);

const websiteId = siteUrl("/#website");
const marketId = siteUrl("/#market");
const features = [
  {
    title: "Explore the map",
    description: "Browse both floors and check shop dimensions and availability.",
    href: routes.plans,
    image: "/media/render-15-small.webp",
    sources: "/media/render-15-small.webp 640w, /media/render-15.webp 1619w",
    icon: "plan",
    label: "Map Layout",
  },
  {
    title: "Discover the project",
    description: "See how covered walkways connect shops around a landscaped plaza.",
    href: routes.details,
    image: "/media/market-courtyard-editorial.webp",
    icon: "shops",
    label: "Project details",
  },
  {
    title: "Walk the market street",
    description: "See the entrance, covered arcades and courtyard from different viewpoints.",
    href: routes.gallery,
    image: "/media/render-08-small.webp",
    sources: "/media/render-08-small.webp 640w, /media/render-08.webp 1672w",
    icon: "image",
    label: "View gallery",
  },
];

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
    <section className="home-hero" aria-labelledby="home-title">
      <div className="home-width home-hero-inner">
        <div className="home-hero-content">
          <p className="hero-location"><Icon name="pin" size={17}/> Unn, Shamli, Uttar Pradesh</p>
          <h1 id="home-title">Naya Baazar <span>Made for Unn.</span></h1>
          <p className="hero-description">An open-air market by Defence Garden, with two levels of shops around a landscaped courtyard.</p>
          <div className="home-actions">
            <Link className="home-button home-button-primary" href={routes.plans + "#model"} prefetch={false}><Icon name="cube" size={20}/>3D Model</Link>
            <Link className="home-button home-button-outline" href={routes.plans}><Icon name="plan" size={19}/>Explore Map Layout</Link>
          </div>
        </div>
      </div>
      <picture className="home-hero-image">
        <source media="(max-width: 700px)" srcSet="/media/market-watercolour-small.webp" />
        <img src="/media/market-watercolour.webp" alt="Watercolour aerial view of Naya Baazar’s curved shopping arcades and central plaza" width="1659" height="948" fetchPriority="high" />
      </picture>
      <div className="home-width hero-facts">
        <MarketFacts shopCount={plan.length}/>
        <Link className="hero-tour" href={routes.walkthrough}><Icon name="film" size={19}/>Watch the walkthrough</Link>
      </div>
    </section>

    <section className="home-explore" aria-labelledby="explore-title">
      <div className="home-width">
        <div className="home-section-intro">
          <h2 id="explore-title">A market around <span>a courtyard.</span></h2>
          <p>Covered walkways connect two floors of shops to the central plaza. Explore the market and compare shop sizes on the interactive map.</p>
        </div>
        <div className="home-feature-grid">
          {features.map(feature => <article className="home-feature" key={feature.href}>
            <Link href={feature.href} className="home-feature-link" aria-label={feature.label}>
              <div className="home-feature-picture">
                <img src={feature.image} srcSet={feature.sources}
                  sizes="(max-width: 660px) 92vw, 32vw" alt="" loading="lazy" decoding="async"/>
              </div>
              <div className="home-feature-body">
                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
                <span className="home-feature-action"><Icon name={feature.icon} size={17}/>{feature.label}</span>
              </div>
            </Link>
          </article>)}
        </div>
      </div>
    </section>

    <section className="home-contact" aria-labelledby="contact-title">
      <div className="home-width home-contact-inner">
        <h2 id="contact-title">Interested in a shop?</h2>
        <p>Speak with Defence Garden about shop availability at Naya Baazar.</p>
        <a className="home-button home-button-primary" href={enquiry.href}><Icon name="phone" size={18}/>Call {enquiry.display}</a>
      </div>
    </section>
  </>;
}
