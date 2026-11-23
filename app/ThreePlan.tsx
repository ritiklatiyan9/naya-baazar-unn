"use client";

import { useEffect, useRef, useState } from "react";
import register from "../src/plan-data.json";
import type { ModelState, createViewer } from "./model/viewer";
import type { Booking, Floor } from "./model/geometry";
import "./ThreePlan.css";

type Props = {
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
function Glyph({ name }: { name: "minus" | "plus" | "reset" | "street" | "orbit" | "expand" }) {
  const paths = {
    minus: "M5 12h14",
    plus: "M5 12h14M12 5v14",
    reset: "M3 10V4m0 6h6M4 9a8.5 8.5 0 1 1 1 8",
    street: "M3 20V8l6-3v15m0-10 6-4v14m0-11 6-3v14M1 20h22",
    orbit: "M8 5c-4 1-6 3-6 5 0 4 7 6 13 5m0-3 5 2-4 4M12 4l6 3v6l-6 3-6-3V7z",
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
  const [hover, setHover] = useState<{ id: number; x: number; y: number } | null>(null);
  const latest = useRef({ onSelect, floor, selected });
  const effectiveEntire = entire && selected === null;
  const state = useRef<ModelState>({ floor, selected, statuses, entire: effectiveEntire });
  useEffect(() => {
    latest.current = { onSelect, floor, selected };
  }, [onSelect, floor, selected]);
  useEffect(() => {
    state.current = { floor, selected, statuses, entire: effectiveEntire };
    controller.current?.update(state.current);
  }, [floor, selected, statuses, effectiveEntire]);
  useEffect(() => {
    if (!host.current) return;
    const node = host.current,
      abort = new AbortController();
    setPhase("loading");
    setHover(null);
    void import("./model/viewer")
      .then(({ createViewer }) =>
        createViewer(node, abort.signal, {
          select(id) {
            setEntire(false);
            latest.current.onSelect(id);
          },
          hover(id, x, y) {
            if (!abort.signal.aborted) setHover(id === null ? null : { id, x, y });
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
  const units = register.filter((unit) => effectiveEntire || unit.floor === floor);
  return (
    <section className="three-plan" ref={panel} aria-label="Interactive 3D shop model">
      <div className="three-head">
        <div className="three-floor-control" role="group" aria-label="Floors in 3D">
          {(["ground", "first"] as const).map((f) => (
            <button
              key={f}
              aria-pressed={floor === f && !effectiveEntire}
              onClick={() => {
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
          <>
            <div className="three-camera">
              <button
                onClick={() => controller.current?.setView("courtyard")}
                title="View the courtyard and street furniture"
              >
                <Glyph name="street" />
                Courtyard view
              </button>
            </div>
            {hover && (
              <div
                className="three-tooltip"
                style={{
                  left: Math.max(62, Math.min(hover.x, (host.current?.clientWidth ?? 400) - 62)),
                  top: Math.max(47, hover.y - 8),
                }}
              >
                <b>Shop {hover.id}</b>
                <span>{statuses[hover.id] ?? "Unconfirmed"}</span>
              </div>
            )}
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
                onClick={() => controller.current?.setView("overview")}
              >
                <Glyph name="reset" />
              </button>
            </div>
          </>
        )}
      </div>
      <div className="three-bottom">
        <div className="three-legend">
          <span>
            <i />
            Available
          </span>
          <span>
            <i />
            Booked
          </span>
        </div>
        <label className="three-picker">
          <span className="sr">Select a shop in 3D</span>
          <select
            value={selected ?? ""}
            onChange={(e) => {
              if (e.target.value) {
                setEntire(false);
                onSelect(Number(e.target.value));
              }
            }}
          >
            <option value="" disabled>
              Select a shop
            </option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                Shop {u.id} · {names[u.floor as Floor]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="three-caption">
        Drag to orbit, scroll or pinch to zoom. Shop footprints follow the drawings. Heights and streetscape
        details are illustrative.
      </p>
    </section>
  );
}
