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
    imageLarge: "/media/render-15.webp",
    icon: "plan",
    label: "Map Layout",
  },
  {
    title: "Discover the project",
    description: "See how covered walkways connect shops around a landscaped plaza.",
    href: routes.details,
    image: "/media/market-arcade-concept.webp",
    icon: "shops",
    label: "Project details",
  },
  {
    title: "See the market from above",
    description: "Browse architectural views of the entrance, arcades and central courtyard.",
    href: routes.gallery,
    image: "/media/market-courtyard-concept.webp",
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
      <picture className="home-hero-image">
        <source media="(max-width: 700px)" srcSet="/media/market-hero-mobile.webp" />
        <img src="/media/market-hero.webp" alt="" width="1898" height="829" fetchPriority="high" />
      </picture>
      <div className="home-hero-content">
        <p className="hero-location"><Icon name="pin" size={15}/> Unn, Shamli, Uttar Pradesh</p>
        <h1 id="home-title">Find your place<br className="hero-title-break"/> at Naya Baazar.</h1>
        <p className="hero-description">An open-air market by Defence Garden, with two levels of shops around a landscaped courtyard.</p>
        <div className="home-actions">
          <Link className="home-button home-button-light" href={routes.plans}><Icon name="plan" size={19}/>Explore Map Layout</Link>
          <Link className="home-button home-button-glass" href={routes.walkthrough}><Icon name="film" size={19}/>Watch the walkthrough</Link>
        </div>
      </div>
      <span className="hero-caption">AI-generated concept image</span>
    </section>

    <MarketFacts shopCount={plan.length}/>

    <section className="home-explore" aria-labelledby="explore-title">
      <div className="home-section-intro">
        <h2 id="explore-title">Explore Naya Baazar</h2>
        <p>Get to know the market, then use the interactive map to find a shop that suits your business.</p>
      </div>
      <div className="home-feature-grid">
        {features.map(feature => <article className="home-feature" key={feature.href}>
          <Link href={feature.href} className="home-feature-link" aria-label={feature.label}>
            <div className="home-feature-picture">
              <img src={feature.image} srcSet={feature.imageLarge && `${feature.image} 640w, ${feature.imageLarge} 1619w`}
                sizes="(max-width: 660px) 94vw, 30vw" alt="" loading="lazy" decoding="async"/>
              {feature.icon !== "plan" && <span className="feature-caption">AI concept image</span>}
            </div>
            <div className="home-feature-body">
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
              <span className="home-feature-action"><Icon name={feature.icon} size={17}/>{feature.label}</span>
            </div>
          </Link>
        </article>)}
      </div>
    </section>

    <section className="home-contact" aria-labelledby="contact-title">
      <div>
        <h2 id="contact-title">Interested in a shop?</h2>
        <p>Speak with Defence Garden about shop availability at Naya Baazar.</p>
      </div>
      <a className="home-button home-button-light" href={enquiry.href}><Icon name="phone" size={18}/>Call {enquiry.display}</a>
    </section>
  </>;
}
