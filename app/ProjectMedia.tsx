"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type RefObject } from "react";
import { walkthrough } from "../lib/site-metadata";
import { routes } from "../lib/site";
import { chapters, openPhotograph, photographs, renderPath } from "../src/gallery.js";
import { Icon } from "./icons";
import "../public/gallery.css";
import "./project-features.css";

function WalkthroughPlayer({ videoRef, onTimeUpdate }: {
  videoRef?: RefObject<HTMLVideoElement | null>;
  onTimeUpdate?: (time: number) => void;
}) {
  return <video
    ref={videoRef}
    className="nb-tour-player"
    controls
    playsInline
    preload="metadata"
    poster={walkthrough.poster}
    aria-label={walkthrough.title}
    onTimeUpdate={onTimeUpdate && ((event) => onTimeUpdate(event.currentTarget.currentTime))}
  >
    <source src={walkthrough.video} type="video/mp4" />
    <track src="/media/chapters.vtt" kind="chapters" srcLang="en" label="Walkthrough chapters" />
    <a href={walkthrough.video}>Open the walkthrough video</a>
  </video>;
}

export function ProjectGallery() {
  const [filter, setFilter] = useState<"photos" | "videos">("photos");
  const [showAll, setShowAll] = useState(false);
  const lightbox = useRef<HTMLDivElement>(null);
  const firstExtraPhoto = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (showAll) firstExtraPhoto.current?.focus();
  }, [showAll]);

  return <section className="nb-media-section" aria-labelledby="gallery-heading">
    <header className="nb-media-heading">
      <h1 id="gallery-heading">Naya Baazar gallery</h1>
      <p className="nb-heading-note">Sixteen architectural views of the market in Unn, Shamli, from the street entrance to the central courtyard.</p>
    </header>
    <div className="nb-gallery-filters" role="group" aria-label="Media type">
      <button type="button" aria-pressed={filter === "photos"} onClick={() => setFilter("photos")}>
        <Icon name="image" /> Photos <span>{photographs.length}</span>
      </button>
      <button type="button" aria-pressed={filter === "videos"} onClick={() => { setFilter("videos"); setShowAll(false); }}>
        <Icon name="film" /> Videos <span>1</span>
      </button>
    </div>
    <div className="nb-gallery-panel">
      {filter === "photos" ? <>
        <div className={`nb-photo-grid${showAll ? " nb-show-all" : ""}`} id="nb-gallery-photos">
          {photographs.map(([id, title, description], index) => <button
            key={id}
            ref={index === 5 ? firstExtraPhoto : undefined}
            type="button"
            className="nb-photo-card"
            aria-label={`Enlarge ${title.toLowerCase()}`}
            onClick={(event) => { if (lightbox.current) openPhotograph(lightbox.current, index, event.currentTarget); }}
          >
            <span className="nb-photo-frame">
              <img
                src={renderPath(id, index !== 0)}
                loading={index < 2 ? "eager" : "lazy"}
                fetchPriority={index === 0 ? "high" : undefined}
                decoding="async"
                alt={description}
                width={640}
                height={400}
              />
              <span className="nb-photo-expand"><Icon name="expand" /></span>
            </span>
            <span className="nb-photo-title">{title}</span>
          </button>)}
        </div>
        <button type="button" className="nb-more-photos" aria-controls="nb-gallery-photos" aria-expanded={showAll} hidden={showAll} onClick={() => setShowAll(true)}>
          Show all {photographs.length} photos
        </button>
      </> : <figure className="nb-gallery-film">
        <WalkthroughPlayer />
        <figcaption><strong><Link href={routes.walkthrough}>Naya Baazar walkthrough</Link></strong><span>{walkthrough.duration} seconds</span></figcaption>
      </figure>}
    </div>
    <div ref={lightbox} />
  </section>;
}

export function ProjectWalkthrough() {
  const video = useRef<HTMLVideoElement>(null);
  const chapterList = useRef<HTMLDetailsElement>(null);
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (chapterList.current && window.matchMedia("(min-width: 52.01rem)").matches) {
      chapterList.current.open = true;
    }
  }, []);

  function playChapter(time: number, index: number) {
    const player = video.current;
    if (!player) return;
    player.currentTime = time;
    setCurrent(index);
    void player.play().catch(() => player.focus());
  }

  return <section className="nb-media-section" aria-labelledby="walkthrough-heading">
    <header className="nb-media-heading">
      <h1 id="walkthrough-heading">Naya Baazar walkthrough</h1>
      <p className="nb-heading-note">{walkthrough.description}</p>
    </header>
    <div className="nb-tour-layout">
      <div className="nb-tour-screen">
        <WalkthroughPlayer videoRef={video} onTimeUpdate={(time) => {
          setCurrent(chapters.reduce((active, [start], index) => start <= time ? index : active, 0));
        }} />
        <div className="nb-tour-meta"><span>Architectural render film</span><span>{walkthrough.duration} seconds</span></div>
      </div>
      <details className="nb-tour-chapters" ref={chapterList}>
        <summary><span>Chapters</span><Icon name="chevron-down" /></summary>
        <div className="nb-chapters-list">
          {chapters.map(([time, title, , id], index) => <button
            key={time}
            type="button"
            aria-label={`Play ${title} from ${time} seconds`}
            aria-current={index === current ? "true" : undefined}
            onClick={() => playChapter(time, index)}
          >
            <img src={renderPath(id, true)} loading="lazy" width={88} height={64} alt="" />
            <span><strong>{title}</strong><small>0:{String(time).padStart(2, "0")}</small></span>
          </button>)}
        </div>
        <p className="nb-tour-description">{chapters[current][2]}</p>
      </details>
    </div>
  </section>;
}
