import * as T from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { buildStorey, numberAtlas } from "./buildings";
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
  hover: (id: number | null, x: number, y: number) => void;
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
  const camera = new T.OrthographicCamera(-1, 1, 1, -1, 0.1, 600);
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
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    scene.background = new T.Color("#eeece1");
    canvas.setAttribute(
      "aria-label",
      "Naya Baazar three-dimensional site model. Use the shop selector to inspect a numbered shop with the keyboard.",
    );
    canvas.setAttribute("role", "img");
    canvas.tabIndex = 0;
    host.appendChild(canvas);
    scene.add(new T.HemisphereLight("#fff5e3", "#a8a38a", 2.15));
    const sun = new T.DirectionalLight("#ffe5bd", 3.1);
    sun.position.set(-65, 95, -48);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -95, right: 95, top: 90, bottom: -90, near: 1, far: 290 });
    sun.shadow.bias = -0.00024;
    sun.shadow.normalBias = 0.035;
    scene.add(sun);
    const backdrop = new T.Mesh(
      new T.PlaneGeometry(1500, 1500),
      new T.MeshStandardMaterial({ color: "#e5e1d2", roughness: 1 }),
    );
    backdrop.rotation.x = -Math.PI / 2;
    backdrop.position.y = -1.1;
    backdrop.receiveShadow = true;
    scene.add(backdrop);
    buildMarket(scene);
    const atlas = numberAtlas();
    const ground = buildStorey(groundUnits, "ground", atlas),
      first = buildStorey(firstUnits, "first", atlas);
    scene.add(ground.group, first.group);
    controls.enableDamping = false;
    controls.enablePan = true;
    controls.screenSpacePanning = false;
    controls.minZoom = 0.7;
    controls.maxZoom = 12;
    controls.minPolarAngle = 0.16;
    controls.maxPolarAngle = Math.PI * 0.42;
    controls.touches.ONE = T.TOUCH.ROTATE;
    controls.touches.TWO = T.TOUCH.DOLLY_PAN;
    controls.zoomSpeed = 0.85;
    const raycaster = new T.Raycaster(),
      cursor = new T.Vector2();
    const sceneBounds = new T.Box3();
    const footprint = [...groundUnits, ...firstUnits].flatMap((unit) => unit.outline);
    footprint.forEach((p) => sceneBounds.expandByPoint(new T.Vector3(p.x, 0, p.y)));
    const centre = sceneBounds.getCenter(new T.Vector3());
    centre.y = 2;
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
    const resize = () => {
      const { width, height } = host.getBoundingClientRect();
      if (width < 2 || height < 2) return;
      const aspect = width / height;
      const direction = new T.Vector3(0.35, 0.95, 1).normalize();
      const right = new T.Vector3().crossVectors(new T.Vector3(0, 1, 0), direction).normalize();
      const up = new T.Vector3().crossVectors(direction, right);
      let horizontal = 0,
        vertical = 0;
      for (const p of footprint) {
        const rel = new T.Vector3(p.x - centre.x, 3, p.y - centre.z);
        horizontal = Math.max(horizontal, Math.abs(right.dot(rel)));
        vertical = Math.max(vertical, Math.abs(up.dot(rel)));
      }
      const half = Math.max((horizontal + 5) / aspect, vertical + 6) * 1.07;
      camera.top = half;
      camera.bottom = -half;
      camera.right = half * aspect;
      camera.left = -camera.right;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      render();
    };
    function setView(view: CameraView) {
      if (view === "overview") {
        controls.target.copy(centre);
        camera.position.copy(centre).add(new T.Vector3(0.35, 0.95, 1).normalize().multiplyScalar(175));
        camera.zoom = 1;
      } else {
        const p = sheetPoint(833, 645);
        controls.target.set(p.x, 1.3, p.y);
        camera.position.copy(controls.target).add(new T.Vector3(-29, 25, 37));
        camera.zoom = Math.max(2.5, Math.min(8, (camera.top - camera.bottom) / 22));
      }
      camera.updateProjectionMatrix();
      controls.update();
      render();
    }
    function zoom(factor: number) {
      camera.zoom = T.MathUtils.clamp(camera.zoom * factor, controls.minZoom, controls.maxZoom);
      camera.updateProjectionMatrix();
      controls.update();
      render();
    }
    function rotate(step: number) {
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
          const y = (next.floor === "first" ? 2 : 1) * levelHeight + 0.19;
          outline = roofOutline(unit, y, highlightMaterial);
          scene.add(outline);
          if (next.selected !== lastState?.selected && camera.zoom > 1.5) {
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
      options.hover(null, 0, 0);
    }
    function move(e: PointerEvent) {
      if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 5) dragged = true;
      if (e.pointerType !== "mouse" || pointers.size) return;
      const id = pick(e),
        rect = canvas.getBoundingClientRect();
      canvas.style.cursor = id ? "pointer" : "grab";
      options.hover(id, e.clientX - rect.left, e.clientY - rect.top);
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
      options.hover(null, 0, 0);
    }
    function leave() {
      options.hover(null, 0, 0);
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
    canvas.addEventListener("pointerleave", leave);
    canvas.addEventListener("keydown", keyboard);
    canvas.addEventListener("webglcontextlost", contextLost);
    cleanups.push(() => {
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", cancel);
      canvas.removeEventListener("pointerleave", leave);
      canvas.removeEventListener("keydown", keyboard);
      canvas.removeEventListener("webglcontextlost", contextLost);
    });
    const onChange = () => {
      options.hover(null, 0, 0);
      render();
    };
    controls.addEventListener("change", onChange);
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    cleanups.push(() => observer.disconnect());
    resize();
    setView("overview");
    update(state);
    return { update, zoom, setView, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
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
