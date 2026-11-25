import Link from "next/link";
import { developer, routes } from "../lib/site";
import { Icon } from "./icons";
import "./project-features.css";

export function ProjectDetails() {
  return <section className="development-feature" aria-labelledby="development-title">
    <div className="development-lead">
      <div className="development-story">
        <h1 id="development-title">The Naya Baazar <span>project</span></h1>
        <p className="development-intro">Naya Baazar is an open-air market in Unn, Shamli, Uttar Pradesh. Two levels of shops look onto a landscaped plaza. Covered walkways wrap around the shopfronts, while an internal driveway connects the market to the street.</p>
        <Link className="development-cta" href={routes.plans}><Icon name="plan" size={17}/>Explore floor plans</Link>
      </div>
      <figure className="development-image">
        <img src="/media/render-12.webp" srcSet="/media/render-12-small.webp 640w, /media/render-12.webp 1574w" sizes="(max-width: 48rem) 100vw, 60vw" width="1574" height="999" fetchPriority="high" alt="A compass mosaic at the centre of Naya Baazar’s tree-lined plaza, framed by two levels of shopfronts"/>
        <figcaption>The central plaza <span>Architectural render</span></figcaption>
      </figure>
    </div>
    <div className="development-register">
      <div>
        <h2>Project at a glance</h2>
        <a className="development-developer" href={developer.url} target="_blank" rel="noreferrer">Visit {developer.name}</a>
      </div>
      <dl className="development-specs">
        <div><dt>Developer</dt><dd>{developer.name}</dd></div>
        <div><dt>Location</dt><dd>Unn, Shamli, Uttar Pradesh</dd></div>
        <div><dt>Ground floor</dt><dd>108 shops <span>Nos. 1–108</span></dd></div>
        <div><dt>First floor</dt><dd>108 shops <span>Nos. 112–219</span></dd></div>
      </dl>
    </div>
    <details className="development-drawings">
      <summary><Icon name="ruler" size={18}/>Drawing notes and source PDF <Icon name="chevron" size={17}/></summary>
      <div>
        <p>Shop sizes show approximate internal enclosing spans, short side first. The dimension register flags irregular shapes. The 3D model follows the drawn shop footprints and uses illustrative heights, finishes and landscaping. The source drawing labels one boundary as 36.00 m. It measures about 36.73 m at the stated scale.</p>
        <a href="/plans/naya-baazar-sizes.pdf" download>Download the original drawings and register</a>
      </div>
    </details>
  </section>;
}

