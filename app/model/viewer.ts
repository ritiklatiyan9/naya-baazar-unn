import * as T from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { buildStorey } from "./buildings";
import { buildMarket } from "./market";
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
};
export type ModelState = {
  floor: Floor;
  entire: boolean;
  selected: number | null;
  statuses: Record<number, Booking>;
};
type CameraView = "overview" | "courtyard";

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
  const camera = new T.PerspectiveCamera(32, 1, 0.35, 1200);
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
    scene.background = new T.Color("#e0ded8");
    canvas.setAttribute(
      "aria-label",
      "Interactive architectural scale model of Naya Baazar. Arrow keys rotate, plus and minus zoom, and Home restores the overview.",
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
      new T.MeshStandardMaterial({ color: "#c9c8c6", roughness: 1 }),
    );
    backdrop.rotation.x = -Math.PI / 2;
    backdrop.position.y = -1.1;
    backdrop.receiveShadow = true;
    scene.add(backdrop);
    const { boardOutline } = buildMarket(scene);
    const ground = buildStorey(groundUnits, "ground"),
      first = buildStorey(firstUnits, "first");
    scene.add(ground.group, first.group);
    // The soft contact immediate to a model on a worktop stays fixed as the camera orbits.
    scene.add(contactShadow([boardOutline], -1.09, 1.15, 0.26));
    scene.add(contactShadow(groundUnits.map((unit) => unit.outline), 0.113, 0.62, 0.18));
    controls.enableDamping = false;
    controls.enablePan = true;
    controls.screenSpacePanning = false;
    controls.minDistance = 9;
    controls.maxDistance = 600;
    controls.minPolarAngle = 0.12;
    controls.maxPolarAngle = Math.PI * 0.45;
    controls.touches.ONE = T.TOUCH.ROTATE;
    controls.touches.TWO = T.TOUCH.DOLLY_PAN;
    controls.zoomSpeed = 0.85;
    const raycaster = new T.Raycaster(),
      cursor = new T.Vector2();
    const framingPoints = boardOutline.map((p) => new T.Vector3(p.x, -1.05, p.y));
    // Roofs and stair caps sit above the board and determine the top margin at low angles.
    for (const unit of firstUnits)
      for (const p of unit.outline) framingPoints.push(new T.Vector3(p.x, 2 * levelHeight + 2.75, p.y));
    const centre = new T.Box3().setFromPoints(framingPoints).getCenter(new T.Vector3());
    let fittedDistance = 190;
    let preset: CameraView | null = "overview";
    let state: ModelState = { floor: "ground", entire: true, selected: null, statuses: {} };
    let lastState: ModelState | undefined;
    let outline: T.Mesh | undefined;
    const highlightMaterial = new T.MeshBasicMaterial({ color: "#d6a546", depthTest: true });
    cleanups.push(() => highlightMaterial.dispose());
    function render() {
      if (closed || frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (!closed) renderer.render(scene, camera);
      });
    }
    function overview() {
      // On a phone, look further along the avenue so the long board fills a portrait frame.
      const wide = T.MathUtils.smoothstep(camera.aspect, 0.8, 1.9);
      const azimuth = T.MathUtils.lerp(1.41, 2.38, wide);
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
    const resize = () => {
      const { width, height } = host.getBoundingClientRect();
      if (width < 2 || height < 2) return;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      if (preset === "overview") overview();
      else if (preset === "courtyard") courtyard();
      render();
    };
    function setView(view: CameraView) {
      preset = view;
      if (view === "overview") overview();
      else courtyard();
      render();
    }
    function zoom(factor: number) {
      preset = null;
      const offset = camera.position.clone().sub(controls.target);
      offset.setLength(T.MathUtils.clamp(offset.length() / factor, controls.minDistance, controls.maxDistance));
      camera.position.copy(controls.target).add(offset);
      controls.update();
      render();
    }
    function rotate(step: number) {
      preset = null;
      const offset = camera.position.clone().sub(controls.target);
      offset.applyAxisAngle(new T.Vector3(0, 1, 0), step);
      camera.position.copy(controls.target).add(offset);
      controls.update();
      render();
    }
    function update(next: ModelState) {
      state = next;
      const showUpper = next.entire || next.floor === "first";
      if (first.group.visible !== showUpper) {
        first.group.visible = showUpper;
        renderer.shadowMap.needsUpdate = true;
      }
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
          if (next.selected !== lastState?.selected && camera.position.distanceTo(controls.target) < fittedDistance / 1.65) {
            preset = null;
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
    const pointers = new Set<number>();
    let start: { x: number; y: number; id: number } | null = null,
      dragged = false;
    function down(e: PointerEvent) {
      pointers.add(e.pointerId);
      if (pointers.size > 1) {
        dragged = true;
        start = null;
        return;
      }
      if (e.button === 0) {
        start = { x: e.clientX, y: e.clientY, id: e.pointerId };
        dragged = false;
      }
    }
    function move(e: PointerEvent) {
      if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 5) dragged = true;
      if (e.pointerType !== "mouse" || pointers.size) return;
      const id = pick(e);
      canvas.style.cursor = id ? "pointer" : "grab";
    }
    function up(e: PointerEvent) {
      pointers.delete(e.pointerId);
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
      pointers.delete(e.pointerId);
      start = null;
      dragged = true;
    }
    function keyboard(e: KeyboardEvent) {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === "+" || e.key === "=") zoom(1.3);
      else if (e.key === "-") zoom(1 / 1.3);
      else if (e.key === "ArrowLeft" || e.key === "ArrowRight") rotate(e.key === "ArrowLeft" ? -0.15 : 0.15);
      else if (e.key === "Home") setView("overview");
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
    controls.addEventListener("change", render);
    controls.addEventListener("start", () => { preset = null; });
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    cleanups.push(() => observer.disconnect());
    resize();
    update(state);
    function setAvailabilityVisible(show: boolean) {
      ground.setAvailabilityVisible(show);
      first.setAvailabilityVisible(show);
      render();
    }
    return { update, zoom, setView, setAvailabilityVisible, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
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
