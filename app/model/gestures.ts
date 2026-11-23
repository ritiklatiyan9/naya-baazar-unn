type CameraActions = {
  pan(dx: number, dy: number): void;
  zoom(factor: number): void;
  turn(radians: number): void;
  pointerDown(): boolean;
};

// WebKit exposes trackpad pinches as cumulative gesture events. Chromium and
// Firefox use wheel events for the same input.
type TrackpadGesture = MouseEvent & { scale: number; rotation: number };
export function bindSurfaceGestures(canvas: HTMLCanvasElement, camera: CameraActions) {
  const listeners = new AbortController();
  const options = { passive: false, capture: true, signal: listeners.signal };
  let screenTouches = 0;
  let fingerAngle: number | null = null;
  let twisting = false;

  function touchAngle(e: TouchEvent) {
    if (e.targetTouches.length !== 2) return null;
    const [a, b] = Array.from(e.targetTouches).sort((p, q) => p.identifier - q.identifier);
    const dx = b.clientX - a.clientX, dy = b.clientY - a.clientY;
    return Math.hypot(dx, dy) >= 16 ? Math.atan2(dy, dx) : null;
  }
  function touchCountChanged(e: TouchEvent) {
    screenTouches = e.targetTouches.length;
    fingerAngle = touchAngle(e);
    twisting = false;
  }
  // OrbitControls already handles the pinch distance and midpoint. Read both
  // fingers together here so a parallel swipe cannot briefly look like a twist.
  function touchMoved(e: TouchEvent) {
    const angle = touchAngle(e);
    if (angle !== null && fingerAngle !== null) {
      const delta = angle - fingerAngle;
      const turn = Math.atan2(Math.sin(delta), Math.cos(delta));
      if (!twisting && Math.abs(turn) < Math.PI / 60) return;
      twisting = true;
      camera.turn(turn);
    }
    fingerAngle = angle;
  }
  for (const event of ["touchstart", "touchend", "touchcancel"] as const) {
    canvas.addEventListener(event, touchCountChanged, { passive: true, signal: listeners.signal });
  }
  canvas.addEventListener("touchmove", touchMoved, { passive: true, signal: listeners.signal });

  const wheelGap = 180;
  let lastSlide = -Infinity;
  let lastPinch = -Infinity;
  let pinchX = 0, pinchY = 0;
  let nativeGesture: TrackpadGesture | null = null;
  function movePinchCentre(x: number, y: number, previousX: number, previousY: number) {
    if (Number.isFinite(x - previousX) && Number.isFinite(y - previousY) && !camera.pointerDown() && (x !== previousX || y !== previousY)) {
      camera.pan(x - previousX, y - previousY);
    }
  }
  function wheel(e: WheelEvent) {
    const now = performance.now();
    if (nativeGesture || e.ctrlKey || e.metaKey) {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (nativeGesture || screenTouches) return;
      if (now - lastPinch < wheelGap) movePinchCentre(e.clientX, e.clientY, pinchX, pinchY);
      pinchX = e.clientX;
      pinchY = e.clientY;
      lastPinch = now;
      const pixels = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? canvas.clientHeight : 1);
      camera.zoom(Math.exp(-Math.max(-80, Math.min(80, pixels)) * 0.012));
      return;
    }
    // Line/page wheels and common mouse detents keep their usual zoom. A
    // continuous pixel swipe stays a pan even as it accelerates vertically.
    if (e.deltaMode !== WheelEvent.DOM_DELTA_PIXEL) return;
    const discrete = e.deltaX === 0 && e.deltaY !== 0 && (e.deltaY % 100 === 0 || e.deltaY % 120 === 0);
    if (discrete && now - lastSlide >= wheelGap) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    lastSlide = now;
    camera.pan(-e.deltaX, -e.deltaY);
  }
  canvas.addEventListener("wheel", wheel, options);

  function webkitGesture(event: Event) {
    event.preventDefault();
    if (event.type === "gestureend" || screenTouches) {
      nativeGesture = null;
      return;
    }
    const current = event as TrackpadGesture;
    if (event.type === "gesturechange" && nativeGesture) {
      const previous = nativeGesture;
      if (current.scale > 0 && previous.scale > 0) camera.zoom(current.scale / previous.scale);
      if (current.rotation !== previous.rotation) camera.turn((current.rotation - previous.rotation) * Math.PI / 180);
      movePinchCentre(current.clientX, current.clientY, previous.clientX, previous.clientY);
    }
    nativeGesture = current;
  }
  for (const name of ["gesturestart", "gesturechange", "gestureend"]) {
    canvas.addEventListener(name, webkitGesture, options);
  }
  return {
    pinching: () => nativeGesture !== null || performance.now() - lastPinch < wheelGap,
    dispose: () => listeners.abort(),
  };
}
