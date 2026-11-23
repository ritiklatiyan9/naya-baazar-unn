import * as T from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { bindSurfaceGestures } from "./gestures";
import { buildStorey } from "./buildings";
import { buildMarket } from "./market";
import { westPassageWalkway, wingBoundaries } from "./wings";
import { cafeTableFootprints } from "./cafes";
import { entranceLength, entrancePoint, entranceSign, fountainWallFace } from "./entranceLayout";
import { entranceFountainFootprints } from "./entranceFountain";
import { entrancePalmTrunks } from "./entrancePalms";
import { glassSetback, retailBays, shopFloorHeight, shopEntrance } from "./retailFrontages";
import {
  disposeScene,
  levelHeight,
  readFloor,
  sheetPoint,
  type Booking,
  type Floor,
  type Unit,
} from "./geometry";

type ViewOptions = {
  select: (id: number) => void;
  failed: () => void;
  viewChanged?: (view: CameraView | null) => void;
};
export type ModelState = {
  floor: Floor;
  entire: boolean;
  selected: number | null;
  statuses: Record<number, Booking>;
};
type WalkingView = "street" | "gallery" | "delivery" | "entrance";
export type CameraView = "overview" | "courtyard" | WalkingView;

export async function createViewer(host: HTMLDivElement, signal: AbortSignal, options: ViewOptions) {
  const [groundUnits, firstUnits] = await Promise.all([
    readFloor("ground", signal),
    readFloor("first", signal),
  ]);
  signal.throwIfAborted();
  const canvas = document.createElement("canvas");
  const renderer = new T.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: "low-power",
  });
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(32, 1, 0.15, 1200);
  const controls = new OrbitControls(camera, canvas);
  let frame = 0,
    closed = false;
  const cleanups: (() => void)[] = [];
  function dispose() {
    if (closed) return;
    closed = true;
    cancelAnimationFrame(frame);
    cleanups.forEach((clean) => clean());
    controls.dispose();
    disposeScene(scene);
    scene.traverse((obj) => {
      if (obj instanceof T.DirectionalLight) obj.shadow.dispose();
    });
    renderer.dispose();
    renderer.forceContextLoss();
    canvas.remove();
  }
  try {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFShadowMap;
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true;
    renderer.toneMapping = T.NeutralToneMapping;
    renderer.toneMappingExposure = 1;
    const studioBackground = new T.Color("#183a30");
    const skylineBackground = new T.Color("#cfddde");
    scene.background = studioBackground;
    canvas.setAttribute(
      "aria-label",
      "Interactive Naya Baazar market. Drag to orbit or look around. Slide two fingers, Shift-drag or right-drag to move. Pinch to zoom. Twist on a touchscreen to turn. Use WASD to move, Q and E to turn, plus and minus to zoom and Home for the overview.",
    );
    canvas.setAttribute("role", "img");
    canvas.tabIndex = 0;
    host.appendChild(canvas);

    // Broad, neutral studio fill keeps the ivory stock distinct from the recessed glazing.
    scene.add(new T.HemisphereLight("#edf2f8", "#c3c4c3", 1.76));
    const key = new T.DirectionalLight("#fffaf5", 2.25);
    key.position.set(-48, 88, 60);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -102, right: 102, top: 87, bottom: -87, near: 1, far: 240 });
    key.shadow.bias = -0.00012;
    key.shadow.normalBias = 0.026;
    key.shadow.radius = 2.2;
    scene.add(key);
    const fill = new T.DirectionalLight("#e6edf7", 0.68);
    fill.position.set(47, 38, -65);
    scene.add(fill);

    const backdrop = new T.Mesh(
      new T.PlaneGeometry(2200, 2200),
      new T.MeshStandardMaterial({ color: "#264838", roughness: 1 }),
    );
    backdrop.rotation.x = -Math.PI / 2;
    backdrop.position.y = -1.1;
    backdrop.receiveShadow = true;
    scene.add(backdrop);
    const { boardOutline, activity, updateFountain } = buildMarket(scene, groundUnits, firstUnits);
    const boardBounds = new T.Box2().setFromPoints(boardOutline);
    const horizon = walkingHorizon(() => { if (!closed) render(); });
    horizon.visible = false;
    scene.add(horizon);
    const refreshMaterials = () => queueMicrotask(() => { if (!closed) render(); });
    const ground = buildStorey(groundUnits, "ground", refreshMaterials),
      first = buildStorey(firstUnits, "first", refreshMaterials);
    scene.add(ground.group, first.group);
    // The soft contact immediate to a model on a worktop stays fixed as the camera orbits.
    scene.add(contactShadow([boardOutline], -1.09, 1.15, 0.26));
    scene.add(contactShadow(groundUnits.map((unit) => unit.outline), 0.113, 0.62, 0.18));
    controls.enableDamping = false;
    controls.enablePan = true;
    controls.screenSpacePanning = false;
    // A cursor drag can switch from orbit to pan while a pinch or Shift is held.
    // Handle the primary mouse button below; OrbitControls owns touch and the other buttons.
    controls.mouseButtons.LEFT = null;
    controls.mouseButtons.RIGHT = T.MOUSE.PAN;
    controls.touches.ONE = T.TOUCH.ROTATE;
    controls.touches.TWO = T.TOUCH.DOLLY_PAN;
    controls.zoomSpeed = 0.85;
    const raycaster = new T.Raycaster(),
      cursor = new T.Vector2();
    const framingPoints = boardOutline.map((p) => new T.Vector3(p.x, -1.05, p.y));
    for (const palm of entrancePalmTrunks) {
      const centre = entrancePoint(palm.x, palm.z);
      framingPoints.push(new T.Vector3(centre.x, 7.1, centre.y));
    }
    // Roofs and stair caps sit above the board and determine the top margin at low angles.
    for (const unit of firstUnits)
      for (const p of unit.outline) framingPoints.push(new T.Vector3(p.x, 2 * levelHeight + 2.75, p.y));
    const centre = new T.Box3().setFromPoints(framingPoints).getCenter(new T.Vector3());
    let fittedDistance = 190;
    let preset: CameraView | null = "overview";
    let location: CameraView = "overview";
    const paths: Partial<Record<Floor, ReturnType<typeof walkableFloor>>> = {};
    const previousEye = new T.Vector2();
    let activityEnabled = !matchMedia("(prefers-reduced-motion: reduce)").matches;
    let visible = true;
    let dirty = true;
    let activityTime = 0;
    let lastTick = 0;
    let lastDoorFrame = 0;
    let doorsMoving = false;
    let state: ModelState = { floor: "ground", entire: true, selected: null, statuses: {} };
    let lastState: ModelState | undefined;
    let outline: T.Mesh | undefined;
    const highlightMaterial = new T.MeshBasicMaterial({ color: "#d6a546", depthTest: true });
    cleanups.push(() => highlightMaterial.dispose());
    function queueFrame() {
      if (!closed && !frame && visible && !document.hidden) frame = requestAnimationFrame(drawFrame);
    }
    function drawFrame(now: number) {
      frame = 0;
      if (closed || document.hidden || !visible) return;
      if (activityEnabled && (!lastTick || now - lastTick >= 1000 / 30 - 1)) {
        if (lastTick) activityTime += Math.min((now - lastTick) / 1000, 0.15);
        lastTick = now;
        activity.update(activityTime);
        updateFountain(activityTime);
        dirty = true;
      }
      if (dirty || (doorsMoving && now - lastDoorFrame >= 1000 / 30 - 1)) {
        const step = activityEnabled && lastDoorFrame ? Math.min((now - lastDoorFrame) / 1000, 0.1) : 1;
        lastDoorFrame = now;
        const groundMoving = ground.updateDoors(camera.position, step, activity.openDoors.ground);
        const upperMoving = first.updateDoors(camera.position, step, activity.openDoors.first);
        doorsMoving = groundMoving || upperMoving;
        activity.setCameraPosition(camera.position);
        renderer.render(scene, camera);
        dirty = false;
      }
      if (activityEnabled || doorsMoving) queueFrame();
    }
    function render() {
      dirty = true;
      queueFrame();
    }
    function setActivityEnabled(enabled: boolean) {
      activityEnabled = enabled;
      lastTick = 0;
      render();
    }
    function visibilityChanged() {
      lastTick = 0;
      if (document.hidden || !visible) {
        cancelAnimationFrame(frame);
        frame = 0;
      } else render();
    }
    document.addEventListener("visibilitychange", visibilityChanged);
    const visibilityObserver = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      visibilityChanged();
    });
    visibilityObserver.observe(host);
    cleanups.push(() => {
      document.removeEventListener("visibilitychange", visibilityChanged);
      visibilityObserver.disconnect();
    });
    function overview() {
      // On a phone, look further along the avenue so the long board fills a portrait frame.
      const wide = T.MathUtils.smoothstep(camera.aspect, 0.8, 1.9);
      const azimuth = T.MathUtils.lerp(-1.39, -0.76, wide);
      const direction = new T.Vector3(Math.sin(azimuth), 0.87 - 0.15 * wide, Math.cos(azimuth)).normalize();
      const right = new T.Vector3().crossVectors(camera.up, direction).normalize();
      const up = new T.Vector3().crossVectors(direction, right);
      const tanY = Math.tan(T.MathUtils.degToRad(camera.fov / 2));
      const tanX = tanY * camera.aspect;
      const points = framingPoints.map((p) => {
        const rel = p.clone().sub(centre);
        return { x: rel.dot(right), y: rel.dot(up), z: rel.dot(direction) };
      });
      // Solve the minimum perspective distance and target offset for the full board.
      // Unlike a bounding sphere this also centres the nearer edge of the plinth.
      const frameScale = 0.90;
      function span(axis: "x" | "y", tangent: number) {
        const slope = tangent * frameScale;
        let lower = -Infinity, upper = Infinity;
        for (const p of points) {
          lower = Math.max(lower, p[axis] + p.z * slope);
          upper = Math.min(upper, p[axis] - p.z * slope);
        }
        return { distance: (lower - upper) / (2 * slope), midpoint: (upper + lower) / 2 };
      }
      const x = span("x", tanX), y = span("y", tanY);
      fittedDistance = Math.max(x.distance, y.distance);
      controls.target.copy(centre).addScaledVector(right, x.midpoint).addScaledVector(up, y.midpoint);
      camera.position.copy(controls.target).addScaledVector(direction, fittedDistance);
      // Keep the orbit and zoom pivot inside the model even when the photograph is off-centre.
      controls.target.addScaledVector(direction, (2.4 - controls.target.y) / direction.y);
      fittedDistance = camera.position.distanceTo(controls.target);
      controls.update();
    }
    function courtyard() {
      const point = sheetPoint(731, 596);
      controls.target.set(point.x, 1.6, point.y);
      // Look past the floral paving towards the far island with the arcade on either side.
      const offset = new T.Vector3(46, 24, 12);
      offset.multiplyScalar(Math.max(1, 1.25 / camera.aspect));
      camera.position.copy(controls.target).add(offset);
      controls.update();
    }
    function onFoot() { return location !== "overview" && location !== "courtyard"; }
    function eyeHeight() {
      return (location === "gallery" ? shopFloorHeight.first : shopFloorHeight.ground) + 1.58;
    }
    function fieldOfView() {
      if (location === "entrance") return T.MathUtils.lerp(80, 60, T.MathUtils.smoothstep(camera.aspect, 1, 1.85));
      return onFoot() ? 60 : 32;
    }
    function walkingView(view: WalkingView) {
      // A diagonal from the opposite kerb frames both ends of the wall, including on a phone.
      const aimOffset = T.MathUtils.lerp(1.55, -2.75, T.MathUtils.smoothstep(camera.aspect, 1, 1.85));
      const viewpoints = {
        entrance: { eye: entrancePoint(-4.95, entranceLength - .56), target: entrancePoint(fountainWallFace, entranceSign.z + aimOffset), drop: -.12 },
        street:   { eye: sheetPoint(939, 569), target: sheetPoint(992, 603), drop: 0.31 },
        gallery:  { eye: sheetPoint(1124, 747), target: sheetPoint(1069, 713), drop: 0.65 },
        delivery: { eye: sheetPoint(833, 315), target: sheetPoint(870, 367), drop: 0.40 },
      } as const;
      const { eye, target: destination, drop } = viewpoints[view];
      camera.position.set(eye.x, eyeHeight(), eye.y);
      controls.target.set(destination.x, eyeHeight() - drop, destination.y);
      previousEye.copy(eye);
      controls.update();
    }
    const resize = () => {
      const { width, height } = host.getBoundingClientRect();
      if (width < 2 || height < 2) return;
      camera.aspect = width / height;
      camera.fov = fieldOfView();
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      if (preset === "overview") overview();
      else if (preset === "courtyard") courtyard();
      else if (preset === "entrance") walkingView("entrance");
      render();
    };
    function setView(view: CameraView) {
      preset = view;
      location = view;
      const walking = onFoot();
      horizon.visible = walking;
      scene.background = walking ? skylineBackground : studioBackground;
      camera.fov = fieldOfView();
      camera.near = walking ? 0.065 : 0.20;
      camera.updateProjectionMatrix();
      controls.minDistance = walking ? 1.1 : 7;
      controls.maxDistance = walking ? 18 : 600;
      controls.minPolarAngle = walking ? 0.80 : 0.12;
      controls.maxPolarAngle = walking ? 2.25 : Math.PI * 0.45;
      controls.panSpeed = walking ? 1.45 : 1;
      // In the arcades the same drag turns the eye in place.
      controls.enableRotate = !walking;
      if (view === "overview") overview();
      else if (view === "courtyard") courtyard();
      else walkingView(view);
      options.viewChanged?.(view);
      render();
    }
    function moved() {
      if (preset === null) return;
      preset = null;
      options.viewChanged?.(onFoot() ? location : null);
    }
    function zoom(factor: number) {
      moved();
      const offset = camera.position.clone().sub(controls.target);
      offset.setLength(T.MathUtils.clamp(offset.length() / factor, controls.minDistance, controls.maxDistance));
      camera.position.copy(controls.target).add(offset);
      controls.update();
      render();
    }
    function rotate(step: number) {
      moved();
      if (onFoot()) { lookAround(step, 0); return; }
      const offset = camera.position.clone().sub(controls.target);
      offset.applyAxisAngle(new T.Vector3(0, 1, 0), step);
      camera.position.copy(controls.target).add(offset);
      controls.update();
      render();
    }
    function lookAround(yaw: number, pitch: number) {
      moved();
      const offset = controls.target.clone().sub(camera.position);
      const angles = new T.Spherical().setFromVector3(offset);
      angles.theta += yaw;
      angles.phi = T.MathUtils.clamp(angles.phi + pitch, 0.96, 2.19);
      controls.target.copy(camera.position).add(offset.setFromSpherical(angles));
      controls.update();
      render();
    }
    function constrainCamera() {
      if (preset === null) {
        const current = onFoot() ? camera.position : controls.target;
        let x: number, z: number;
        if (onFoot()) {
          const floor = location === "gallery" ? "first" : "ground";
          paths[floor] ??= walkableFloor(boardBounds, boardOutline, floor, floor === "first" ? firstUnits : groundUnits);
          const movedEye = paths[floor]!.travel(previousEye, current.x, current.z);
          x = movedEye.x;
          z = movedEye.y;
          previousEye.copy(movedEye);
        } else {
          x = T.MathUtils.clamp(current.x, boardBounds.min.x, boardBounds.max.x);
          z = T.MathUtils.clamp(current.z, boardBounds.min.y, boardBounds.max.y);
        }
        const correction = new T.Vector3(x - current.x, onFoot() ? eyeHeight() - current.y : 0, z - current.z);
        camera.position.add(correction);
        controls.target.add(correction);
      }
      render();
    }
    function update(next: ModelState) {
      state = next;
      const showUpper = next.entire || next.floor === "first";
      activity.setUpperVisible(showUpper);
      if (first.group.visible !== showUpper) {
        first.group.visible = showUpper;
        renderer.shadowMap.needsUpdate = true;
      }
      if (!showUpper && location === "gallery") setView("street");
      if (lastState?.statuses !== next.statuses) {
        ground.color(next.statuses);
        first.color(next.statuses);
      }
      if (
        !lastState ||
        next.selected !== lastState.selected ||
        next.floor !== lastState.floor ||
        next.entire !== lastState.entire
      ) {
        if (outline) {
          scene.remove(outline);
          outline.geometry.dispose();
          outline = undefined;
        }
        const unit = (next.floor === "ground" ? groundUnits : firstUnits).find((u) => u.id === next.selected);
        if (unit) {
          const y = (next.floor === "first" ? 2 : 1) * levelHeight + 0.24;
          outline = roofOutline(unit, y, highlightMaterial);
          scene.add(outline);
          if (!onFoot() && next.selected !== lastState?.selected && camera.position.distanceTo(controls.target) < fittedDistance / 1.65) {
            moved();
            const offset = camera.position.clone().sub(controls.target);
            controls.target.set(unit.centre.x, y, unit.centre.y);
            camera.position.copy(controls.target).add(offset);
            controls.update();
          }
        }
      }
      lastState = next;
      render();
    }
    function pick(event: PointerEvent) {
      const rect = canvas.getBoundingClientRect();
      cursor.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        (-(event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(cursor, camera);
      const levels = state.entire ? [ground, first] : state.floor === "first" ? [first] : [ground];
      const hit = raycaster.intersectObjects(
        levels.map((level) => level.body),
        false,
      )[0];
      if (!hit?.face) return null;
      return (hit.object === ground.body ? ground : first).pick(hit.face);
    }
    const pointers = new Map<number, T.Vector2>();
    let start: { x: number; y: number; id: number } | null = null,
      lookPointer: number | null = null,
      pinchDrag = false,
      dragged = false;
    function pan(dx: number, dy: number) {
      moved();
      controls.pan(dx * controls.panSpeed, dy * controls.panSpeed);
    }
    const gestures = bindSurfaceGestures(canvas, {
      pan,
      zoom(factor) {
        start = null;
        if (pointers.size) pinchDrag = true;
        zoom(factor);
      },
      turn: rotate,
      pointerDown: () => pointers.size > 0,
    });
    cleanups.push(gestures.dispose);
    function down(e: PointerEvent) {
      canvas.focus({ preventScroll: true });
      pointers.set(e.pointerId, new T.Vector2(e.clientX, e.clientY));
      canvas.setPointerCapture(e.pointerId);
      if (pointers.size > 1) {
        dragged = true;
        start = null;
        lookPointer = null;
        return;
      }
      const modified = e.ctrlKey || e.shiftKey || e.metaKey;
      pinchDrag = e.pointerType !== "touch" && gestures.pinching();
      const turns = (e.button === 0 && !modified) || (e.button === 2 && modified);
      lookPointer = onFoot() && turns ? e.pointerId : null;
      if (e.button === 0 && !modified) {
        start = { x: e.clientX, y: e.clientY, id: e.pointerId };
        dragged = false;
      }
    }
    function move(e: PointerEvent) {
      if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 5) dragged = true;
      const position = pointers.get(e.pointerId);
      if (position) {
        const dx = e.clientX - position.x, dy = e.clientY - position.y;
        const primaryCursor = e.pointerType !== "touch" && (e.buttons & 1) !== 0;
        if (primaryCursor && (e.shiftKey || e.ctrlKey || e.metaKey || pinchDrag)) {
          pan(dx, dy);
        } else if (onFoot() && (primaryCursor || lookPointer === e.pointerId)) {
          const scale = Math.PI * 0.72 / Math.max(280, canvas.clientHeight);
          lookAround(-dx * scale, dy * scale);
        } else if (primaryCursor) {
          moved();
          const scale = 2 * Math.PI / canvas.clientHeight;
          controls.rotateLeft(dx * scale);
          controls.rotateUp(dy * scale);
        }
        position.set(e.clientX, e.clientY);
        return;
      }
      if (e.pointerType !== "mouse" || pointers.size) return;
      const id = pick(e);
      canvas.style.cursor = id ? "pointer" : "grab";
    }
    function release(e: PointerEvent) {
      pointers.delete(e.pointerId);
      pinchDrag = false;
      // Resume one-finger looking from the surviving finger's latest position.
      lookPointer = onFoot() && e.pointerType === "touch" && pointers.size === 1
        ? pointers.keys().next().value ?? null : null;
    }
    function up(e: PointerEvent) {
      release(e);
      if (
        start?.id === e.pointerId &&
        !dragged &&
        Math.hypot(e.clientX - start.x, e.clientY - start.y) <= 5
      ) {
        const id = pick(e);
        if (id !== null) options.select(id);
      }
      start = null;
      dragged = false;
    }
    function cancel(e: PointerEvent) {
      release(e);
      start = null;
      dragged = true;
    }
    function keyboard(e: KeyboardEvent) {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const key = e.key.toLowerCase();
      if (key === "+" || key === "=") zoom(1.3);
      else if (key === "-") zoom(1 / 1.3);
      else if (key === "q" || key === "e") {
        rotate(key === "q" ? 0.15 : -0.15);
      } else if (["w", "a", "s", "d", "arrowup", "arrowleft", "arrowdown", "arrowright"].includes(key)) {
        moved();
        const forward = controls.target.clone().sub(camera.position);
        forward.y = 0;
        forward.normalize();
        const right = forward.clone().cross(camera.up);
        const step = onFoot() ? 0.7 : camera.position.distanceTo(controls.target) * 0.035;
        const delta = key === "w" || key === "arrowup" ? forward :
          key === "s" || key === "arrowdown" ? forward.negate() :
          key === "a" || key === "arrowleft" ? right.negate() : right;
        camera.position.addScaledVector(delta, step);
        controls.target.addScaledVector(delta, step);
        controls.update();
      } else if (key === "home") setView("overview");
      else return;
      e.preventDefault();
    }
    function contextLost(e: Event) {
      e.preventDefault();
      if (!closed) options.failed();
    }
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", cancel);
    canvas.addEventListener("keydown", keyboard);
    canvas.addEventListener("webglcontextlost", contextLost);
    cleanups.push(() => {
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", cancel);
      canvas.removeEventListener("keydown", keyboard);
      canvas.removeEventListener("webglcontextlost", contextLost);
    });
    let interacting = false;
    controls.addEventListener("start", () => { interacting = true; });
    controls.addEventListener("end", () => { interacting = false; });
    controls.addEventListener("change", () => {
      if (interacting) moved();
      constrainCamera();
    });
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    cleanups.push(() => observer.disconnect());
    resize();
    setView("overview");
    update(state);
    void activity.facesReady.then(render);
    function setAvailabilityVisible(show: boolean) {
      ground.setAvailabilityVisible(show);
      first.setAvailabilityVisible(show);
      render();
    }
    return { update, zoom, setView, setAvailabilityVisible, setActivityEnabled, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}

/** Floor-level navigation follows walkways and passes through the entrances into individual shop aisles. */
function walkableFloor(bounds: T.Box2, boundary: T.Vector2[], floor: Floor, units: Unit[]) {
  const ppm = 6;
  const size = bounds.getSize(new T.Vector2());
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(size.x * ppm);
  canvas.height = Math.ceil(size.y * ppm);
  const c = canvas.getContext("2d", { willReadFrequently: true })!;
  c.setTransform(ppm, 0, 0, ppm, -bounds.min.x * ppm, -bounds.min.y * ppm);
  c.fillStyle = "black";
  c.fillRect(bounds.min.x, bounds.min.y, size.x, size.y);
  function polygon(points: T.Vector2[]) {
    c.beginPath();
    c.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) c.lineTo(points[i].x, points[i].y);
    c.closePath();
    c.fill();
  }
  if (floor === "ground") {
    c.fillStyle = "white";
    polygon(boundary);
  }
  const glass = glassSetback[floor];
  for (const wing of wingBoundaries) {
    c.fillStyle = "black";
    polygon(wing.points);
    c.fillStyle = "white";
    for (const bay of retailBays(wing, units)) {
      const half = bay.width / 2;
      const doorway = shopEntrance(bay.width);
      function band(left: number, right: number, from: number, to: number) {
        const front: T.Vector2[] = [], back: T.Vector2[] = [];
        const subdivisions = Math.ceil((right - left) / 0.7);
        for (let i = 0; i <= subdivisions; i++) {
          const x = T.MathUtils.lerp(left, right, i / subdivisions);
          front.push(bay.at(x, from));
          back.push(bay.at(x, to));
        }
        polygon(front.concat(back.reverse()));
      }
      // A small overlap joins neighbouring bays even on tight rail curves.
      band(-half - 0.06, half + 0.06, floor === "first" ? 0.25 : -0.26, glass - 0.20);
      band(doorway.center - doorway.halfWidth + 0.13, doorway.center + doorway.halfWidth - 0.13,
        glass - 0.36, glass + 0.46);
      band(-half + 0.22, half - 0.22, glass + 0.24, glass + 1.42);
      // At a sharp corner an offset aisle can fold over its neighbour. The door itself
      // always has a straight approach perpendicular to its centre, including at these bends.
      const outside = bay.at(doorway.center, glass - 0.58);
      const inside = bay.at(doorway.center, glass + 1.1);
      c.beginPath();
      c.moveTo(outside.x, outside.y);
      c.lineTo(inside.x, inside.y);
      c.strokeStyle = "white";
      c.lineWidth = Math.min(0.5, 2 * doorway.halfWidth - 0.20);
      c.stroke();
    }
  }
  c.fillStyle = "white";
  polygon(westPassageWalkway);
  if (floor === "ground") {
    c.fillStyle = "black";
    for (const {minX, minZ, maxX, maxZ} of entranceFountainFootprints) {
      const margin = 0.19;
      polygon([
        entrancePoint(minX - margin, minZ - margin), entrancePoint(maxX + margin, minZ - margin),
        entrancePoint(maxX + margin, maxZ + margin), entrancePoint(minX - margin, maxZ + margin),
      ]);
    }
    for (const trunk of entrancePalmTrunks) {
      const p = entrancePoint(trunk.x, trunk.z);
      c.beginPath();
      c.arc(p.x, p.y, trunk.radius + 0.19, 0, Math.PI * 2);
      c.fill();
    }
    for (const table of cafeTableFootprints(units)) {
      c.beginPath();
      c.arc(table.center.x, table.center.y, table.radius + 0.16, 0, Math.PI * 2);
      c.fill();
    }
  }
  const pixels = c.getImageData(0, 0, canvas.width, canvas.height).data;
  const width = canvas.width, height = canvas.height;
  function allowed(x: number, z: number) {
    const i = Math.floor((x - bounds.min.x) * ppm), j = Math.floor((z - bounds.min.y) * ppm);
    return i > 1 && j > 1 && i < width - 2 && j < height - 2 && pixels[4 * (j * width + i)] > 100;
  }
  const position = new T.Vector2();
  return {
    travel(from: T.Vector2, x: number, z: number) {
      position.copy(from);
      const dx = x - from.x, dz = z - from.y;
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dz)) * ppm));
      // Sample the segment to avoid jumping through windows on long pointer moves; slide along walls.
      for (let i = 0; i < Math.min(steps, 180); i++) {
        const nextX = position.x + dx / steps, nextZ = position.y + dz / steps;
        if (allowed(nextX, nextZ)) position.set(nextX, nextZ);
        else if (allowed(nextX, position.y)) position.x = nextX;
        else if (allowed(position.x, nextZ)) position.y = nextZ;
        else break;
      }
      return position;
    },
  };
}

/** A distant belt of trees sampled from the project render finishes the horizon at pedestrian height. */
function walkingHorizon(changed: () => void) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const c = canvas.getContext("2d")!;
  const sky = c.createLinearGradient(0, 0, 0, 210);
  sky.addColorStop(0, "#cfddde");
  sky.addColorStop(0.7, "#e9e5ce");
  sky.addColorStop(0.72, "#6f8069");
  sky.addColorStop(1, "#274a34");
  c.fillStyle = sky;
  c.fillRect(0, 0, canvas.width, canvas.height);
  const map = new T.CanvasTexture(canvas);
  map.colorSpace = T.SRGBColorSpace;
  map.wrapS = T.MirroredRepeatWrapping;
  map.repeat.x = 8;
  const img = new Image();
  img.onload = () => {
    // The west half of the aerial photograph contains a continuous tree line and open sky.
    c.drawImage(img, img.width * 0.05, img.height * 0.015, img.width * 0.35, img.height * 0.29,
      0, 115, canvas.width, 141);
    const blend = c.createLinearGradient(0, 114, 0, 157);
    blend.addColorStop(0, "#dde2d6");
    blend.addColorStop(1, "rgba(221,226,214,0)");
    c.fillStyle = blend;
    c.fillRect(0, 114, canvas.width, 43);
    map.needsUpdate = true;
    changed();
  };
  img.src = "/media/render-09-small.webp";
  const skyMesh = new T.Mesh(new T.CylinderGeometry(175, 175, 96, 64, 1, true),
    new T.MeshBasicMaterial({ map, side: T.BackSide, toneMapped: false, depthWrite: false }));
  skyMesh.position.y = 16;
  skyMesh.renderOrder = -2;
  map.addEventListener("dispose", () => { img.onload = null; });
  return skyMesh;
}

/** A small baked contact texture adds ambient occlusion without a per-frame postprocess. */
function contactShadow(outlines: T.Vector2[][], height: number, softness: number, opacity: number) {
  const bounds = new T.Box2();
  for (const outline of outlines) for (const p of outline) bounds.expandByPoint(p);
  bounds.expandByScalar(softness * 3);
  const size = bounds.getSize(new T.Vector2()), centre = bounds.getCenter(new T.Vector2());
  const ppm = 1024 / Math.max(size.x, size.y);
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(size.x * ppm);
  canvas.height = Math.ceil(size.y * ppm);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = ctx.shadowColor = "#ffffff";
  ctx.shadowBlur = softness * ppm;
  ctx.beginPath();
  for (const outline of outlines) {
    outline.forEach((p, i) => {
      const x = (p.x - bounds.min.x) / size.x * canvas.width;
      const y = (p.y - bounds.min.y) / size.y * canvas.height;
      if (!i) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
  }
  ctx.fill();
  const map = new T.CanvasTexture(canvas);
  map.colorSpace = T.SRGBColorSpace;
  const material = new T.MeshBasicMaterial({
    color: "#393630", map, transparent: true, opacity, depthWrite: false, toneMapped: false,
  });
  const mesh = new T.Mesh(new T.PlaneGeometry(size.x, size.y), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(centre.x, height, centre.y);
  return mesh;
}

function roofOutline(unit: Unit, height: number, mat: T.Material) {
  const vertices: number[] = [];
  unit.outline.forEach((a, i) => {
    const b = unit.outline[(i + 1) % unit.outline.length],
      dir = b.clone().sub(a).normalize();
    const dx = -dir.y * 0.115,
      dz = dir.x * 0.115;
    vertices.push(
      a.x + dx,
      height,
      a.y + dz,
      a.x - dx,
      height,
      a.y - dz,
      b.x + dx,
      height,
      b.y + dz,
      b.x + dx,
      height,
      b.y + dz,
      a.x - dx,
      height,
      a.y - dz,
      b.x - dx,
      height,
      b.y - dz,
    );
  });
  const geo = new T.BufferGeometry();
  geo.setAttribute("position", new T.Float32BufferAttribute(vertices, 3));
  mat.side = T.DoubleSide;
  return new T.Mesh(geo, mat);
}
