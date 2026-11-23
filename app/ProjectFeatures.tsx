"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "./icons";
import "./project-features.css";

export function ProjectDetails() {
  return <section className="development-feature" aria-labelledby="development-title">
    <div className="development-lead">
      <div className="development-story">
        <p className="feature-label">Project details</p>
        <h1 id="development-title">Around the <span>courtyard.</span></h1>
        <p className="development-intro">In Unn, Shamli, two levels of shops look onto a landscaped plaza. Covered walkways wrap around the shopfronts, while an internal driveway connects the market to the street.</p>
        <a className="development-cta" href="#layout"><Icon name="plan" size={17}/>Explore floor plans</a>
      </div>
      <figure className="development-image">
        <img src="/media/render-12.webp" srcSet="/media/render-12-small.webp 640w, /media/render-12.webp 1574w" sizes="(max-width: 48rem) 100vw, 60vw" alt="A compass mosaic at the centre of the tree-lined plaza, framed by two levels of shopfronts"/>
        <figcaption>The central plaza <span>Architectural render</span></figcaption>
      </figure>
    </div>
    <div className="development-register">
      <div>
        <h2>Project at a glance</h2>
        <a className="development-developer" href="https://defencegarden.com/" target="_blank" rel="noreferrer">Visit Defence Garden</a>
      </div>
      <dl className="development-specs">
        <div><dt>Developer</dt><dd>Defence Garden</dd></div>
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

export function MediaView({view}:{view:"gallery"|"walkthrough"}) {
  const ref = useRef<HTMLDivElement>(null);
  const [failed,setFailed] = useState(false);
  const [attempt,setAttempt] = useState(0);
  useEffect(()=>{
    let active=true;
    const container=ref.current;
    setFailed(false);
    import("../src/gallery.js").then(mod=>{
      if(active && container) (view==="gallery"?mod.mountGallery:mod.mountWalkthrough)(container);
    }).catch(()=>{if(active)setFailed(true);});
    return ()=>{active=false;container?.replaceChildren();};
  },[view,attempt]);
  return <div className="feature-media">{failed && <p role="status">The media viewer could not load. <button className="text-link" onClick={()=>setAttempt(a=>a+1)}>Retry</button></p>}<div ref={ref}/></div>;
}

