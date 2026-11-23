"use client";

import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import register from "../src/plan-data.json";
import "./plan-canvas.css";

type Floor = "ground" | "first";
type Status = "available" | "booked";
type Props = {
  floor: Floor;
  onFloor: (floor: Floor) => void;
  statuses: Record<number, Status>;
  selected: number | null;
  onSelect: (id: number) => void;
};

type Point = { x: number; y: number };
type View = Point & { zoom: number };
const sheet = { x: 185, y: 210, width: 2960, height: 1706 };
const fitView: View = { x: sheet.x + sheet.width / 2, y: sheet.y + sheet.height / 2, zoom: 1 };
const maxZoom = 8;
const planCache = new Map<Floor, Promise<string>>();

function loadPlan(floor: Floor) {
  const cached = planCache.get(floor);
  if (cached) return cached;
  const pending = fetch(`/plans/${floor}.svg`).then(async (response) => {
    if (!response.ok) throw new Error("Plan unavailable");
    const drawing = await response.text();
    const svg = new DOMParser().parseFromString(drawing, "image/svg+xml").documentElement;
    if (svg.localName !== "svg" || svg.querySelectorAll("[data-shop]").length !== 108) {
      throw new Error("Incomplete floor drawing");
    }
    return drawing;
  }).catch((error) => {
    planCache.delete(floor);
    throw error;
  });
  planCache.set(floor, pending);
  return pending;
}

const glyphs: Record<string, ReactNode> = {
  expand: <path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>,
  close: <path d="m5 5 14 14M19 5 5 19"/>,
  plus: <path d="M12 5v14M5 12h14"/>,
  minus: <path d="M5 12h14"/>,
  fit: <><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/><rect x="8.5" y="8.5" width="7" height="7" rx="1"/></>,
};

function Icon({ name }: { name: keyof typeof glyphs }) {
  return <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">{glyphs[name]}</svg>;
}

function inBounds(x: number, min: number, max: number) {
  return Math.max(min, Math.min(max, x));
}

function boundView(x: number, y: number, zoom: number): View {
  const halfWidth = sheet.width / (2 * zoom);
  const halfHeight = sheet.height / (2 * zoom);
  return {
    x: inBounds(x, sheet.x + halfWidth, sheet.x + sheet.width - halfWidth),
    y: inBounds(y, sheet.y + halfHeight, sheet.y + sheet.height - halfHeight),
    zoom,
  };
}

// Keep the vector tree mounted during ordinary React updates so keyboard focus and pointer targets survive.
const Drawing = memo(function Drawing({ source }: { source: string }) {
  return <div className="pc-art" dangerouslySetInnerHTML={{ __html: source }} />;
});

type PlanViewProps = Props & { expanded: boolean; onExpand: () => void };

function PlanView({ floor, onFloor, statuses, selected, onSelect, expanded, onExpand }: PlanViewProps) {
  const surface = useRef<HTMLDivElement>(null);
  const [source, setSource] = useState("");
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [view, setView] = useState<View>(fitView);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ pointerId: number; x: number; y: number; view: View; ratio: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const floorName = floor === "ground" ? "Ground floor" : "First floor";
  const getSvg = useCallback(() => surface.current?.querySelector<SVGSVGElement>(".nb-plan"), []);

  useEffect(() => {
    let current = true;
    loadPlan(floor).then((value) => { if (current) setSource(value); }).catch(() => { if (current) setFailed(true); });
    return () => { current = false; };
  }, [floor, attempt]);

  useLayoutEffect(() => {
    const svg = getSvg();
    if (!svg) return;
    const groups = svg.querySelectorAll<SVGGElement>("[data-shop]");
    const selectedOnFloor = selected !== null && svg.querySelector(`[data-shop="${selected}"]`);
    groups.forEach((group, index) => {
      const id = Number(group.dataset.shop);
      const status = statuses[id];
      group.dataset.status = status ?? "unknown";
      group.dataset.selected = String(id === selected);
      group.setAttribute("aria-pressed", String(id === selected));
      group.setAttribute("aria-label", `${group.querySelector("title")?.textContent}. ${status ?? "Availability pending"}`);
      group.setAttribute("tabindex", (selectedOnFloor ? id === selected : index === 0) ? "0" : "-1");
    });
  }, [source, statuses, selected, getSvg]);

  useLayoutEffect(() => {
    const svg = getSvg();
    if (!svg) return;
    const width = sheet.width / view.zoom;
    const height = sheet.height / view.zoom;
    svg.setAttribute("viewBox", `${view.x - width / 2} ${view.y - height / 2} ${width} ${height}`);
  }, [source, view, getSvg]);

  useEffect(() => {
    if (selected === null || !source) return;
    const box = getSvg()?.querySelector<SVGPathElement>(`[data-shop="${selected}"] .nb-unit`)?.getBBox();
    if (!box) return;
    setView((previous) => {
      if (previous.zoom === 1) return previous;
      const halfWidth = sheet.width / (2 * previous.zoom);
      const halfHeight = sheet.height / (2 * previous.zoom);
      const visible = box.x >= previous.x - halfWidth && box.x + box.width <= previous.x + halfWidth &&
        box.y >= previous.y - halfHeight && box.y + box.height <= previous.y + halfHeight;
      return visible ? previous : boundView(box.x + box.width / 2, box.y + box.height / 2, previous.zoom);
    });
  }, [selected, source, getSvg]);

  function shopCentre(id: number) {
    const box = getSvg()?.querySelector<SVGPathElement>(`[data-shop="${id}"] .nb-unit`)?.getBBox();
    return box && { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }

  function zoomBy(factor: number) {
    const target = selected !== null ? shopCentre(selected) : undefined;
    setView((previous) => {
      const zoom = inBounds(previous.zoom * factor, 1, maxZoom);
      if (zoom === 1) return fitView;
      const focus = previous.zoom === 1 && target ? target : previous;
      return boundView(focus.x, focus.y, zoom);
    });
  }

  function pointerDown(event: PointerEvent<HTMLDivElement>) {
    suppressClick.current = false;
    if (view.zoom <= 1 || event.button !== 0 || !event.isPrimary) return;
    const ratio = getSvg()?.getScreenCTM()?.a;
    if (ratio) drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, view, ratio, moved: false };
  }

  function pointerMove(event: PointerEvent<HTMLDivElement>) {
    const start = drag.current;
    if (!start || event.pointerId !== start.pointerId) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (!start.moved && Math.hypot(dx, dy) < 4) return;
    if (!start.moved) {
      event.currentTarget.setPointerCapture(event.pointerId);
      start.moved = true;
      suppressClick.current = true;
      setDragging(true);
    }
    setView(boundView(start.view.x - dx / start.ratio, start.view.y - dy / start.ratio, start.view.zoom));
  }

  function endDrag(event: PointerEvent<HTMLDivElement>) {
    if (drag.current?.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    drag.current = null;
    setDragging(false);
  }

  function keyDown(event: KeyboardEvent<HTMLDivElement>) {
    const key = event.key;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const group = event.target instanceof Element ? event.target.closest<SVGGElement>("[data-shop]") : null;
    if (group && (key === "Enter" || key === " ")) {
      event.preventDefault();
      onSelect(Number(group.dataset.shop));
      return;
    }
    const forward = key === "ArrowRight" || key === "ArrowDown";
    const backward = key === "ArrowLeft" || key === "ArrowUp";
    if (key === "+" || key === "=" || key === "-" || key === "0") {
      event.preventDefault();
      if (key === "0") setView(fitView);
      else zoomBy(key === "-" ? 1 / 1.6 : 1.6);
    } else if (forward || backward) {
      event.preventDefault();
      if (group) {
        const shops = Array.from(getSvg()?.querySelectorAll<SVGGElement>("[data-shop]") ?? []);
        const next = shops[inBounds(shops.indexOf(group) + (forward ? 1 : -1), 0, shops.length - 1)];
        const center = shopCentre(Number(next.dataset.shop));
        if (center && view.zoom > 1) setView(boundView(center.x, center.y, view.zoom));
        next.focus({ preventScroll: true });
      } else if (view.zoom > 1) {
        const dx = key === "ArrowLeft" ? -1 : key === "ArrowRight" ? 1 : 0;
        const dy = key === "ArrowUp" ? -1 : key === "ArrowDown" ? 1 : 0;
        setView(boundView(view.x + dx * sheet.width / (5 * view.zoom), view.y + dy * sheet.height / (5 * view.zoom), view.zoom));
      }
    }
  }

  const statusCount = Object.keys(statuses).length;
  const expandedShop = expanded ? register.find((unit) => unit.floor === floor && unit.id === selected) : undefined;
  return <section className={`pc-card${expanded ? " pc-expanded" : ""}`} aria-label={`${floorName} interactive plan`}>
    <div className="pc-toolbar">
      <div className="pc-floors" role="group" aria-label="Choose floor">
        {(["ground", "first"] as const).map((value) => <button type="button" key={value} aria-pressed={floor === value} onClick={() => onFloor(value)}>{value === "ground" ? "Ground floor" : "First floor"}</button>)}
      </div>
      <button type="button" className="pc-expand" onClick={onExpand} title={expanded ? "Close expanded plan" : "Expand plan"} aria-label={expanded ? "Close expanded plan" : "Expand plan"}>
        <Icon name={expanded ? "close" : "expand"} /><span>{expanded ? "Close" : "Expand"}</span>
      </button>
    </div>
    <div className={`pc-stage${view.zoom > 1 ? " pc-stage-zoomed" : ""}`}>
      <i className="pc-cross pc-cross-nw" aria-hidden="true"/><i className="pc-cross pc-cross-ne" aria-hidden="true"/>
      <i className="pc-cross pc-cross-sw" aria-hidden="true"/><i className="pc-cross pc-cross-se" aria-hidden="true"/>
      <div className="pc-sheet-id" aria-hidden="true"><strong>{floorName}</strong><span>108 shops</span></div>
      {source ? <div className={`pc-surface${view.zoom > 1 ? " pc-zoomed" : ""}${dragging ? " pc-dragging" : ""}`} tabIndex={0} ref={surface}
        aria-label="Shop drawing. Use plus or minus to zoom, 0 to fit, and arrow keys to pan. Tab into shops and use arrow keys to browse."
        onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={endDrag} onPointerCancel={endDrag}
        onPointerLeave={(event) => { if (!drag.current?.moved) endDrag(event); }} onKeyDown={keyDown}
        onClick={(event) => {
          if (suppressClick.current || !(event.target instanceof Element)) return;
          const shop = event.target.closest<SVGGElement>("[data-shop]");
          if (shop) onSelect(Number(shop.dataset.shop));
        }}>
        <Drawing source={source}/>
      </div> : <div className="pc-message" role="status">
        {failed ? <><span>Floor drawing unavailable.</span><button type="button" onClick={() => { setFailed(false); setAttempt((n) => n + 1); }}>Retry drawing</button></> : <span>Loading floor drawing…</span>}
      </div>}
      <p className={statusCount ? "pc-hint pc-usage" : "pc-hint"}>{statusCount === 0 ? "Waiting for availability" : view.zoom > 1 ? "Drag to pan" : "Select a shop to inspect"}</p>
    </div>
    <div className="pc-footer">
      <div className="pc-legend" aria-label="Shop availability legend"><span><i className="pc-available"/>Available</span><span><i className="pc-booked"/>Booked</span></div>
      <div className="pc-tools" role="group" aria-label="Plan zoom controls">
        <button type="button" title="Zoom out" aria-label="Zoom out" disabled={!source || view.zoom <= 1} onClick={() => zoomBy(1 / 1.6)}><Icon name="minus"/></button>
        <button type="button" title="Zoom in" aria-label="Zoom in" disabled={!source || view.zoom >= maxZoom} onClick={() => zoomBy(1.6)}><Icon name="plus"/></button>
        <button type="button" className="pc-fit" title="Fit entire plan" aria-label="Fit entire plan" disabled={!source} onClick={() => setView(fitView)}><Icon name="fit"/></button>
      </div>
    </div>
    {expandedShop && <div className="pc-picked" aria-live="polite">
      <strong>Shop {expandedShop.id}</strong><span>{expandedShop.feet} · {expandedShop.metres} m</span>
      <span className="pc-picked-status">{statuses[expandedShop.id] ?? "Availability pending"}</span>
    </div>}
  </section>;
}

export default function PlanCanvas(props: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [expanded, setExpanded] = useState(false);
  const close = () => dialog.current?.close();
  return <>
    <PlanView key={props.floor} {...props} expanded={false} onExpand={() => {
      dialog.current?.showModal();
      setExpanded(true);
    }}/>
    <dialog ref={dialog} className="pc-dialog" aria-label="Expanded shop plan" onClose={() => setExpanded(false)} onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
      {expanded && <PlanView key={props.floor} {...props} expanded onExpand={close}/>}
    </dialog>
  </>;
}
