"use client";

import { useEffect, useRef, useState } from "react";
import type { CameraView, ModelState, createViewer } from "./model/viewer";
import type { Booking, Floor } from "./model/geometry";
import "./ThreePlan.css";

type Props = {
  directoryOpen: boolean;
  onToggleDirectory: () => void;
  floor: Floor;
  onFloor: (floor: Floor) => void;
  statuses: Record<number, Booking>;
  selected: number | null;
  onSelect: (id: number) => void;
  onClearSelection?: () => void;
  onShowPlan?: () => void;
};
type Controller = Awaited<ReturnType<typeof createViewer>>;
const names = { ground: "Ground floor", first: "First floor" };
const viewpoints: { view: CameraView; label: string }[] = [
  { view: "overview", label: "Overview" },
  { view: "courtyard", label: "Courtyard" },
  { view: "street", label: "Shopfront walk" },
  { view: "gallery", label: "First-floor gallery" },
];
function linkedView(): CameraView {
  return viewpoints.find(({view}) => window.location.hash === "#model/" + view)?.view ?? "overview";
}
function Glyph({ name }: { name: "minus" | "plus" | "reset" | "pause" | "play" | "directory" | "expand" }) {
  const paths = {
    minus: "M5 12h14",
    plus: "M5 12h14M12 5v14",
    reset: "M3 10V4m0 6h6M4 9a8.5 8.5 0 1 1 1 8",
    pause: "M8 5v14M16 5v14",
    play: "M7 4l12 8-12 8z",
    directory: "M9 5h12M9 12h12M9 19h12M3 5h1M3 12h1M3 19h1",
    expand: "M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5",
  };
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
export default function ThreePlan(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  const controller = useRef<Controller | null>(null);
  const { floor, statuses, selected, onSelect, onFloor } = props;
  const [entire, setEntire] = useState(selected === null);
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [canExpand, setCanExpand] = useState(false);
  const [availability, setAvailability] = useState(false);
  const [cameraView, setCameraView] = useState<CameraView | null>("overview");
  const [activity, setActivity] = useState(false);
  const latest = useRef({ onSelect, availability, activity });
  const effectiveEntire = entire && selected === null;
  const state = useRef<ModelState>({ floor, selected, statuses, entire: effectiveEntire });
  useEffect(() => {
    latest.current = { onSelect, availability, activity };
  }, [onSelect, availability, activity]);
  useEffect(() => {
    controller.current?.setAvailabilityVisible(availability);
  }, [availability]);
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setActivity(!preference.matches);
    update();
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    controller.current?.setActivityEnabled(activity);
  }, [activity]);
  useEffect(() => {
    state.current = { floor, selected, statuses, entire: effectiveEntire };
    controller.current?.update(state.current);
  }, [floor, selected, statuses, effectiveEntire]);
  useEffect(() => {
    if (!host.current) return;
    const node = host.current,
      abort = new AbortController();
    setPhase("loading");
    void import("./model/viewer")
      .then(({ createViewer }) =>
        createViewer(node, abort.signal, {
          select(id) {
            setEntire(false);
            latest.current.onSelect(id);
          },
          viewChanged(view) {
            if (!abort.signal.aborted) setCameraView(view);
          },
          failed() {
            if (!abort.signal.aborted) {
              setPhase("error");
              controller.current?.dispose();
              controller.current = null;
            }
          },
        }),
      )
      .then((viewer) => {
        if (abort.signal.aborted) {
          viewer.dispose();
          return;
        }
        controller.current = viewer;
        viewer.update(state.current);
        viewer.setAvailabilityVisible(latest.current.availability);
        viewer.setActivityEnabled(latest.current.activity);
        setPhase("ready");
      })
      .catch(() => {
        if (!abort.signal.aborted) setPhase("error");
      });
    return () => {
      abort.abort();
      controller.current?.dispose();
      controller.current = null;
    };
  }, [attempt]);
  useEffect(() => {
    function changed() {
      setFullscreen(document.fullscreenElement === panel.current);
    }
    setCanExpand(Boolean(document.fullscreenEnabled && panel.current?.requestFullscreen));
    document.addEventListener("fullscreenchange", changed);
    return () => document.removeEventListener("fullscreenchange", changed);
  }, []);
  function chooseView(view: CameraView) {
    if (view === "gallery" && !effectiveEntire && floor === "ground") onFloor("first");
    controller.current?.setView(view);
  }
  const applyLinkedView = useRef(chooseView);
  useEffect(() => { applyLinkedView.current = chooseView; });
  useEffect(() => {
    if (phase !== "ready") return;
    const changed = () => {
      if (window.location.hash.split("/")[0] === "#model") applyLinkedView.current(linkedView());
    };
    changed();
    window.addEventListener("hashchange", changed);
    return () => window.removeEventListener("hashchange", changed);
  }, [phase]);
  function openView(view: CameraView) {
    chooseView(view);
    window.history.replaceState(window.history.state, "", view === "overview" ? "#model" : "#model/" + view);
  }
  return (
    <section className="three-plan" ref={panel} aria-label="Interactive 3D shop model">
      <div className="three-head">
        <div className="three-floor-control" role="group" aria-label="Floors in 3D">
          {(["ground", "first"] as const).map((f) => (
            <button
              key={f}
              aria-pressed={floor === f && !effectiveEntire}
              onClick={() => {
                if (f === "ground" && cameraView === "gallery") openView("street");
                onFloor(f);
                setEntire(false);
              }}
            >
              {names[f]}
            </button>
          ))}
          <button
            aria-pressed={effectiveEntire}
            onClick={() => {
              props.onClearSelection?.();
              setEntire(true);
            }}
          >
            Both floors
          </button>
        </div>
        <div className="three-head-actions">
          {!fullscreen && <button type="button" className="three-directory" onClick={props.onToggleDirectory} aria-label="Shop directory" title="Shop directory" aria-controls="layout-directory" aria-expanded={props.directoryOpen}>
            <Glyph name="directory" /><span>Shop directory</span>
          </button>}
          {canExpand && (
          <button
            className="three-expand"
            onClick={() => {
              if (document.fullscreenElement) void document.exitFullscreen();
              else void panel.current?.requestFullscreen?.().catch(() => {});
            }}
            aria-label={fullscreen ? "Exit full screen" : "Expand 3D model"}
          >
            <Glyph name="expand" />
            <span>{fullscreen ? "Close" : "Expand"}</span>
          </button>
          )}
        </div>
      </div>
      {phase === "ready" && <div className="three-viewbar">
        <div className="three-viewpoints" role="group" aria-label="Camera viewpoints">
          {viewpoints.map(({view, label}) => <button type="button" key={view} aria-pressed={cameraView === view} onClick={() => openView(view)}>{label}</button>)}
        </div>
      </div>}
      <div className="three-stage">
        <div className="three-host" ref={host} />
        {phase === "loading" && (
          <div className="three-message" role="status">
            <span className="three-spinner" />
            Preparing the site model…
          </div>
        )}
        {phase === "error" && (
          <div className="three-message">
            <strong>3D view unavailable</strong>
            <span>Explore the same shops in the interactive floor plan.</span>
            <div>
              <a href="#layout" onClick={() => props.onShowPlan?.()}>
                Open 2D plan
              </a>
              <button onClick={() => setAttempt((n) => n + 1)}>Retry 3D</button>
            </div>
          </div>
        )}
        {phase === "ready" && (
            <div className="three-tools">
              <button aria-label="Zoom out 3D model" onClick={() => controller.current?.zoom(1 / 1.4)}>
                <Glyph name="minus" />
              </button>
              <button aria-label="Zoom in 3D model" onClick={() => controller.current?.zoom(1.4)}>
                <Glyph name="plus" />
              </button>
              <button
                aria-label="Reset 3D view"
                title="Return to whole site"
                onClick={() => openView("overview")}
              >
                <Glyph name="reset" />
              </button>
            </div>
        )}
      </div>
      <div className="three-bottom">
        <label className="three-availability">
          <input
            type="checkbox"
            role="switch"
            checked={availability}
            disabled={phase !== "ready" || Object.keys(statuses).length === 0}
            onChange={event => setAvailability(event.target.checked)}
          />
          <span className="three-switch" aria-hidden="true" />
          Show availability
        </label>
        {availability && <div className="three-legend">
          <span>
            <i />
            Available
          </span>
          <span>
            <i />
            Booked
          </span>
        </div>}
        {phase === "ready" && <button className="three-activity" type="button" onClick={() => setActivity(playing => !playing)}>
          <Glyph name={activity ? "pause" : "play"} />{activity ? "Pause activity" : "Play activity"}
        </button>}
      </div>
      <p className="three-caption">
        {cameraView === "street" || cameraView === "gallery" ? "Drag to look around. Use W, A, S and D to walk." : "Drag to orbit."} Slide two fingers to move, pinch to zoom, or twist on a touchscreen to turn. With a mouse, Shift-drag or right-drag to move. Shop interiors and activity are illustrative.
      </p>
    </section>
  );
}
