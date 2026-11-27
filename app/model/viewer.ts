import * as T from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { addEntranceLights, addHighMasts, applyNight, highMastBases } from "./nightLights";
import { createComposer, createSky, renderQuality, skyPalette, steadyShadowFilter, sunDirection } from "./realism";
import { addSurroundings } from "./surroundings";
import { bindSurfaceGestures } from "./gestures";
import { buildStorey } from "./buildings";
import { buildMarket } from "./market";
import { DELIVERY_SHOT_START, walkthroughs } from "./walkthrough";
import { westPassageWalkway, wingBoundaries } from "./wings";
import { cafeTableFootprints } from "./cafes";
import { galleryStairHeight } from "./galleryStair";
import { pavilionStair, stairRectangle } from "./pavilionStairLayout";
import { shopCheckout } from "./shopCheckouts";
import { entranceLength, entrancePoint, entranceSign, fountainWallFace } from "./entranceLayout";
import { entranceFountainFootprints } from "./entranceFountain";
import { entrancePalmTrunks } from "./entrancePalms";
import { displayDepth, doorStation, glassSetback, retailBays, roomFixtures, shopFloorHeight, shopEntrance } from "./retailFrontages";
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
  walkthroughChanged?: (playback: WalkthroughPlayback | null) => void;
};
export type WalkthroughPlayback = {
  floor: Floor;
  status: "playing" | "paused" | "ended";
  elapsed: number;
  duration: number;
  chapter: string;
};
export type ModelState = {
  floor: Floor;
  entire: boolean;
  selected: number | null;
  statuses: Record<number, Booking>;
};
type WalkingView = "street" | "gallery" | "delivery" | "entrance" | "shop";
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
    // Figures' sun shadows use the stencil to darken overlapping limbs only once.
    stencil: true,
    powerPreference: "high-performance",
  });
  const scene = new T.Scene();
  // The far plane reaches the hazy horizon of the surrounding farmland.
  const camera = new T.PerspectiveCamera(32, 1, 0.15, 5000);
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
      if (obj instanceof T.DirectionalLight || obj instanceof T.SpotLight) obj.shadow.dispose();
    });
    renderer.dispose();
    renderer.forceContextLoss();
    canvas.remove();
  }
  try {
    const quality = renderQuality(renderer);
    steadyShadowFilter();
    // Desktop renders at the display's full density; an upscaled canvas reads as blur.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality.occlusion ? 2 : 1.8));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFShadowMap;
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true;
    // A filmic curve keeps sunlit plaster from clipping while the arcades fall into soft shade.
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.92;
    canvas.setAttribute(
      "aria-label",
      "Interactive Naya Baazar market. Drag to orbit or look around. Slide two fingers, Shift-drag or right-drag to move. Pinch to zoom. Twist on a touchscreen to turn. Use WASD to move, Q and E to turn, plus and minus to zoom and Home for the overview.",
    );
    canvas.setAttribute("role", "img");
    canvas.tabIndex = 0;
    host.appendChild(canvas);

    // Daylight comes from the captured sky (image-based light) plus the sun; the hemisphere adds warm ground bounce.
    const daylight = createSky(renderer, camera.far * .9);
    cleanups.push(daylight.dispose);
    scene.add(daylight.dome);
    scene.environment = daylight.environment(false);
    scene.environmentIntensity = 1;
    scene.fog = new T.FogExp2(skyPalette.day.horizon.clone(), .00042);
    const sky = new T.HemisphereLight("#dfe9f5", "#b6a88f", .35);
    scene.add(sky);
    const key = new T.DirectionalLight("#fff0d9", 3.1);
    key.position.copy(sunDirection).multiplyScalar(180);
    key.castShadow = true;
    key.shadow.mapSize.setScalar(quality.shadowMap);
    // About one shadow texel (5.6 cm on the 4096 map) of normal offset keeps sunlit walls free of acne bands.
    key.shadow.bias = -0.0002;
    key.shadow.normalBias = 0.065;
    // The sun's half-degree disc gives only a few centimetres of penumbra at arcade height.
    key.shadow.radius = 1;
    scene.add(key);
    const fill = new T.DirectionalLight("#e6edf7", 0.18);
    fill.position.set(47, 38, -65);
    scene.add(fill);
    const countryside = addSurroundings(scene, { trees: quality.occlusion ? 1 : .55 });
    const { boardOutline, activity, updateFountain } = buildMarket(scene, groundUnits, firstUnits);
    fitSunShadow(key, boardOutline);
    addHighMasts(scene);
    addEntranceLights(scene);
    const boardBounds = new T.Box2().setFromPoints(boardOutline);
    const refreshMaterials = () => queueMicrotask(() => { if (!closed) render(); });
    const ground = buildStorey(groundUnits, "ground", refreshMaterials),
      first = buildStorey(firstUnits, "first", refreshMaterials);
    scene.add(ground.group, first.group);
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
    let walkingFloor: Floor = "ground";
    let walkingHeight = shopFloorHeight.ground;
    const paths: Partial<Record<Floor, ReturnType<typeof walkableFloor>>> = {};
    const previousEye = new T.Vector2();
    let activityEnabled = !matchMedia("(prefers-reduced-motion: reduce)").matches;
    let visible = true;
    let dirty = true;
    let activityTime = 0;
    let deliveryOffset = 0;
    let tour: WalkthroughPlayback | null = null;
    let aerial = false;
    let reportedQuarter = -1;
    let lastTick = 0;
    let lastDoorFrame = 0;
    let doorsMoving = false;
    let night = false;
    let composer: ReturnType<typeof createComposer> | null = null;
    // Desktop frames always pass through the composer for ambient occlusion; phones only for the night bloom.
    function pipeline() {
      if (!composer) {
        const output = (composer = createComposer(renderer, scene, camera, quality.occlusion));
        const { width, height } = host.getBoundingClientRect();
        output.setSize(Math.max(2, width), Math.max(2, height));
        cleanups.push(output.dispose);
      }
      return composer;
    }
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
      const animating = tour ? tour.status === "playing" : activityEnabled;
      if (animating && (!lastTick || now - lastTick >= 1000 / 30 - 1)) {
        const delta = lastTick ? (now - lastTick) / 1000 : 0;
        lastTick = now;
        if (tour) positionWalkthrough(tour.elapsed + delta);
        else {
          activityTime += Math.min(delta, 0.15);
          activity.update(activityTime, deliveryOffset ? activityTime + deliveryOffset : undefined);
          updateFountain(activityTime);
        }
        dirty = true;
      }
      if (dirty || (doorsMoving && now - lastDoorFrame >= 1000 / 30 - 1)) {
        const step = animating && lastDoorFrame ? Math.min((now - lastDoorFrame) / 1000, 0.1) : 1;
        lastDoorFrame = now;
        const groundMoving = ground.updateDoors(camera.position, step, activity.openDoors.ground);
        const upperMoving = first.updateDoors(camera.position, step, activity.openDoors.first);
        doorsMoving = groundMoving || upperMoving;
        activity.setCameraPosition(camera.position);
        daylight.setTime(activityTime);
        countryside.setTime(activityTime);
        if (quality.occlusion || night) pipeline().render(camera.position.distanceTo(controls.target));
        else renderer.render(scene, camera);
        dirty = false;
      }
      if (animating || doorsMoving) queueFrame();
    }
    function render() {
      dirty = true;
      queueFrame();
    }
    function setNight(on: boolean) {
      if (on === night) return;
      night = on;
      // Bloom joins the composer only for night frames.
      if (on) pipeline().setNight(true);
      else composer?.setNight(false);
      daylight.setNight(on);
      scene.environment = daylight.environment(on);
      scene.environmentIntensity = on ? 0.55 : 1;
      (scene.fog as T.FogExp2).color.copy(on ? skyPalette.night.horizon : skyPalette.day.horizon);
      // Blue-hour ambient keeps the whole site readable. Lamps add warmth without a black void around them.
      sky.color.set(on ? "#7c8db6" : "#dfe9f5");
      sky.groundColor.set(on ? "#3c3a44" : "#b6a88f");
      sky.intensity = on ? 1.1 : 0.35;
      key.color.set(on ? "#bcc8ea" : "#fff0d9");
      key.intensity = on ? 0.45 : 3.1;
      // After dark the fill turns upward: the warm bounce from lit shops and paving onto every ceiling.
      fill.color.set(on ? "#ffc890" : "#e6edf7");
      fill.intensity = on ? 0.8 : 0.18;
      fill.position.set(on ? 0 : 47, on ? -60 : 38, on ? 0 : -65);
      applyNight(scene, on);
      renderer.shadowMap.needsUpdate = true;
      render();
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
      return shopFloorHeight[walkingFloor] + 1.58;
    }
    function fieldOfView() {
      if (tour) return T.MathUtils.lerp(74, 60, T.MathUtils.smoothstep(camera.aspect, 1, 1.85));
      if (location === "entrance") return T.MathUtils.lerp(80, 60, T.MathUtils.smoothstep(camera.aspect, 1, 1.85));
      return onFoot() ? 60 : 32;
    }
    function walkingView(view: WalkingView) {
      if (view === "shop") {
        const route = walkthroughs[walkingFloor];
        const pose = route.sample(route.shopTime, camera.aspect);
        camera.position.fromArray(pose.eye);
        controls.target.fromArray(pose.target);
        previousEye.set(camera.position.x, camera.position.z);
        controls.update();
        return;
      }
      // A diagonal from the opposite kerb frames both ends of the wall, including on a phone.
      const aimOffset = T.MathUtils.lerp(1.55, -2.75, T.MathUtils.smoothstep(camera.aspect, 1, 1.85));
      const viewpoints = {
        entrance: { eye: entrancePoint(-4.95, entranceLength - .56), target: entrancePoint(fountainWallFace, entranceSign.z + aimOffset), drop: -.12 },
        street:   { eye: sheetPoint(939, 569), target: sheetPoint(992, 603), drop: 0.31 },
        gallery:  { eye: sheetPoint(1124, 747), target: sheetPoint(1069, 713), drop: 0.65 },
        delivery: { eye: sheetPoint(805, 411), target: sheetPoint(870, 326), drop: 0.40 },
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
      composer?.setSize(width, height);
      if (tour) positionWalkthrough(tour.elapsed, true);
      else if (preset === "overview") overview();
      else if (preset === "courtyard") courtyard();
      else if (preset === "entrance") walkingView("entrance");
      render();
    };
    function setView(view: CameraView) {
      closeWalkthrough();
      preset = view;
      if (view === "shop") walkingFloor = state.entire && onFoot() ? walkingFloor : state.floor;
      else walkingFloor = view === "gallery" ? "first" : "ground";
      walkingHeight = shopFloorHeight[walkingFloor];
      location = view;
      const walking = onFoot();
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
    /** Stand at a shop's own frontage, on the edge of its arcade, looking out at the mall. Returns its floor, or null for an unknown number. */
    function viewFromShop(id: number): Floor | null {
      const upper = firstUnits.some((unit) => unit.id === id);
      const floor: Floor = upper ? "first" : "ground";
      const arcade = wingBoundaries.flatMap((wing) => retailBays(wing, upper ? firstUnits : groundUnits, floor)).find((bay) => bay.id === id);
      if (!arcade) return null;
      const station = doorStation(arcade);
      // In front of the shop's door and in line with the arcade piers, stepping aside where one stands there.
      const spot = (aside: number) => arcade.at(station + aside, shopViewInset);
      const piers = (upper ? first : ground).piers;
      const aside = [0, 0.35, -0.35, 0.7, -0.7, 1.05, -1.05].find((step) => piers.every((pier) => pier.distanceTo(spot(step)) > 0.6)) ?? 0;
      const eye = spot(aside), outward = arcade.at(station + aside, shopViewInset - 1).sub(eye).normalize();
      // Borrow the on-foot set-up of this floor's walking view, then move to the shop as a free view.
      setView(upper ? "gallery" : "street");
      preset = null;
      camera.position.set(eye.x, eyeHeight(), eye.y);
      controls.target.set(eye.x + 6 * outward.x, eyeHeight() - (upper ? 0.65 : 0.31), eye.y + 6 * outward.y);
      previousEye.copy(eye);
      controls.update();
      canvas.focus({ preventScroll: true });
      render();
      return floor;
    }
    function positionWalkthrough(seconds: number, forceReport = false) {
      if (!tour) return;
      const elapsed = T.MathUtils.clamp(seconds, 0, tour.duration);
      const pose = walkthroughs[tour.floor].sample(elapsed, camera.aspect);
      aerial = pose.aerial;
      camera.position.fromArray(pose.eye);
      controls.target.fromArray(pose.target);
      camera.lookAt(controls.target);
      previousEye.set(camera.position.x, camera.position.z);
      activityTime = elapsed;
      activity.update(elapsed, deliveryOffset ? elapsed + deliveryOffset : undefined);
      updateFountain(elapsed);
      const ended = elapsed === tour.duration;
      const quarter = Math.floor(elapsed * 4);
      const report = forceReport || ended || quarter !== reportedQuarter || tour.chapter !== pose.chapter;
      tour.elapsed = elapsed;
      tour.chapter = pose.chapter;
      if (ended) tour.status = "ended";
      if (report) {
        reportedQuarter = quarter;
        options.walkthroughChanged?.({ ...tour });
      }
    }
    function startWalkthrough(floor: Floor = "ground") {
      setView("street");
      preset = null;
      tour = { floor, status: "playing", elapsed: 0, duration: walkthroughs[floor].duration, chapter: "" };
      deliveryOffset = floor === "ground" ? -DELIVERY_SHOT_START : 0;
      controls.enabled = false;
      canvas.style.pointerEvents = "none";
      canvas.tabIndex = -1;
      camera.fov = fieldOfView();
      camera.updateProjectionMatrix();
      options.viewChanged?.(null);
      lastTick = 0;
      positionWalkthrough(0, true);
      render();
    }
    function toggleWalkthrough() {
      if (!tour) return;
      if (tour.status === "ended") { startWalkthrough(tour.floor); return; }
      tour.status = tour.status === "playing" ? "paused" : "playing";
      lastTick = 0;
      options.walkthroughChanged?.({ ...tour });
      render();
    }
    function seekWalkthrough(seconds: number) {
      if (!tour || !Number.isFinite(seconds)) return;
      if (tour.status === "ended") tour.status = "paused";
      lastTick = 0;
      lastDoorFrame = 0;
      positionWalkthrough(seconds, true);
      render();
    }
    function closeWalkthrough() {
      if (!tour) return;
      tour = null;
      controls.enabled = true;
      canvas.style.pointerEvents = "";
      canvas.tabIndex = 0;
      canvas.style.cursor = "grab";
      lastTick = 0;
      options.walkthroughChanged?.(null);
      if (aerial) {
        aerial = false;
        setView("overview");
        return;
      }
      walkingFloor = camera.position.y >= (shopFloorHeight.first + shopFloorHeight.ground) / 2 + 1.58 ? "first" : "ground";
      walkingHeight = shopFloorHeight[walkingFloor];
      location = walkingFloor === "first" ? "gallery" : "street";
      camera.fov = fieldOfView();
      camera.updateProjectionMatrix();
      // Adopt the current shot as a walking view without shifting the eye when
      // OrbitControls next clamps the distance to its pivot.
      const direction = camera.getWorldDirection(new T.Vector3());
      controls.target.copy(camera.position).addScaledVector(direction, 4);
      controls.update();
      options.viewChanged?.(location);
      render();
    }
    function moved() {
      if (preset === null) return;
      preset = null;
      options.viewChanged?.(onFoot() ? location : null);
    }
    function zoom(factor: number) {
      if (tour) return;
      moved();
      const offset = camera.position.clone().sub(controls.target);
      offset.setLength(T.MathUtils.clamp(offset.length() / factor, controls.minDistance, controls.maxDistance));
      camera.position.copy(controls.target).add(offset);
      controls.update();
      render();
    }
    function rotate(step: number) {
      if (tour) return;
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
      if (tour) return;
      if (preset === null) {
        const current = onFoot() ? camera.position : controls.target;
        let x: number, z: number, height = current.y;
        if (onFoot()) {
          const initialFloor = walkingFloor;
          moveOnFoot(current.x, current.z);
          x = previousEye.x;
          z = previousEye.y;
          height = walkingHeight + 1.58;
          if (initialFloor !== walkingFloor) {
            location = walkingFloor === "first" ? "gallery" : "street";
            options.viewChanged?.(location);
          }
        } else {
          x = T.MathUtils.clamp(current.x, boardBounds.min.x, boardBounds.max.x);
          z = T.MathUtils.clamp(current.z, boardBounds.min.y, boardBounds.max.y);
        }
        const correction = new T.Vector3(x - current.x, height - current.y, z - current.z);
        camera.position.add(correction);
        controls.target.add(correction);
      }
      render();
    }
    function moveOnFoot(x: number, z: number) {
      const dx = x - previousEye.x, dz = z - previousEye.y;
      const count = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dz)) * walkPixelsPerMetre));
      // Sample the segment to prevent long drags or keyboard steps crossing thin walls and rails.
      for (let i = 0; i < Math.min(count, 180); i++) {
        const nx = previousEye.x + dx / count, nz = previousEye.y + dz / count;
        if (!takeStep(nx, nz) && !takeStep(nx, previousEye.y) && !takeStep(previousEye.x, nz)) break;
      }
    }
    function takeStep(x: number, z: number) {
      const height = galleryStairHeight(x, z, walkingHeight);
      if (height === null) return false;
      if (height !== undefined) {
        if (Math.abs(height - walkingHeight) > .26 || (!first.group.visible && height > shopFloorHeight.ground)) return false;
        walkingHeight = height;
        walkingFloor = height > (shopFloorHeight.first + shopFloorHeight.ground) / 2 ? "first" : "ground";
      } else {
        const units = walkingFloor === "first" ? firstUnits : groundUnits;
        const allowed = paths[walkingFloor] ??= walkableFloor(boardBounds, boardOutline, walkingFloor, units);
        if (!allowed(x, z)) return false;
        walkingHeight = shopFloorHeight[walkingFloor];
      }
      previousEye.set(x, z);
      return true;
    }
    function update(next: ModelState) {
      state = next;
      if (tour && next.selected !== null && next.selected !== lastState?.selected) closeWalkthrough();
      const showUpper = next.entire || next.floor === "first";
      activity.setUpperVisible(showUpper);
      if (first.group.visible !== showUpper) {
        first.group.visible = showUpper;
        renderer.shadowMap.needsUpdate = true;
      }
      if (!showUpper && location === "gallery") setView("street");
      if (location === "shop" && !next.entire && walkingFloor !== next.floor) setView("shop");
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
      if (tour) return;
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
      if (tour) return;
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
      if (tour) return;
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
      if (tour) { cancel(e); return; }
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
      if (tour) return;
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
    return { update, zoom, setView, viewFromShop, setAvailabilityVisible, setActivityEnabled, setNight,
      startWalkthrough, toggleWalkthrough, seekWalkthrough, closeWalkthrough, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}

// A visitor arriving by shop number stands this far in from the arcade edge, on the line of its piers.
const shopViewInset = 0.34;
const walkPixelsPerMetre = 6;
/** Floor-level navigation follows walkways and passes through the entrances into individual shop aisles. */
function walkableFloor(bounds: T.Box2, boundary: T.Vector2[], floor: Floor, units: Unit[]) {
  const ppm = walkPixelsPerMetre;
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
  const checkouts: T.Vector2[][] = [], fixtures: T.Vector2[][] = [];
  for (const wing of wingBoundaries) {
    c.fillStyle = "black";
    polygon(wing.points);
    c.fillStyle = "white";
    for (const arcade of retailBays(wing, units, floor)) {
      const checkout = shopCheckout(arcade, floor, units);
      if (checkout) checkouts.push(checkout.footprint(.18));
      const bay = arcade.shop ?? arcade;
      const half = bay.width / 2;
      const doorway = shopEntrance(bay.width);
      function band(left: number, right: number, from: number, to: number, frontage = bay) {
        const front: T.Vector2[] = [], back: T.Vector2[] = [];
        const subdivisions = Math.ceil((right - left) / 0.7);
        for (let i = 0; i <= subdivisions; i++) {
          const x = T.MathUtils.lerp(left, right, i / subdivisions);
          front.push(frontage.at(x, from));
          back.push(frontage.at(x, to));
        }
        polygon(front.concat(back.reverse()));
      }
      // A small overlap joins neighbouring bays even on tight rail curves.
      band(-arcade.width / 2 - 0.06, arcade.width / 2 + 0.06, floor === "first" ? 0.25 : -0.26, glass - .20, arcade);
      band(doorway.center - doorway.halfWidth + 0.13, doorway.center + doorway.halfWidth - 0.13,
        glass - 0.36, glass + 0.46);
      // The clear floor in front of the displays grows with the depth of the room.
      band(-half + 0.22, half - 0.22, glass + 0.24, glass + 1.42 + arcade.depth - displayDepth);
      // Wall displays and display tables stand on that floor.
      for (const { along, depth } of roomFixtures(bay.width, arcade.depth))
        fixtures.push([bay.at(along[0] - .15, glass + depth[0] - .15), bay.at(along[1] + .15, glass + depth[0] - .15),
          bay.at(along[1] + .15, glass + depth[1] + .15), bay.at(along[0] - .15, glass + depth[1] + .15)]);
      // Trace the approach from the arcade to the glass and then straight into the room.
      const outside = bay.at(doorway.center, glass - 0.58);
      const inside = bay.at(doorway.center, glass + 1.1);
      c.beginPath();
      c.moveTo(outside.x, outside.y);
      c.lineTo(inside.x, inside.y);
      c.lineJoin = "round";
      c.strokeStyle = "white";
      c.lineWidth = Math.min(0.5, 2 * doorway.halfWidth - 0.20);
      c.stroke();
    }
  }
  c.fillStyle = "white";
  polygon(westPassageWalkway);
  polygon(stairRectangle(pavilionStair.galleryEdge + .25, pavilionStair.entrance + .06));
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
    for (const mast of highMastBases) {
      c.beginPath();
      c.arc(mast.centre.x, mast.centre.y, mast.radius + 0.19, 0, Math.PI * 2);
      c.fill();
    }
  }
  c.fillStyle = "black";
  for (const footprint of checkouts.concat(fixtures)) polygon(footprint);
  const pixels = c.getImageData(0, 0, canvas.width, canvas.height).data;
  const width = canvas.width, height = canvas.height;
  return (x: number, z: number) => {
    const i = Math.floor((x - bounds.min.x) * ppm), j = Math.floor((z - bounds.min.y) * ppm);
    return i > 1 && j > 1 && i < width - 2 && j < height - 2 && pixels[4 * (j * width + i)] > 100;
  };
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

/** Fit the sun's orthographic shadow camera around the plot and the nearest belt of trees. */
function fitSunShadow(light: T.DirectionalLight, outline: T.Vector2[]) {
  const view = new T.OrthographicCamera();
  view.position.copy(light.position);
  view.lookAt(light.target.position);
  view.updateMatrixWorld();
  const box = new T.Box3();
  for (const p of outline) for (const y of [-0.2, 14])
    box.expandByPoint(new T.Vector3(p.x, y, p.y).applyMatrix4(view.matrixWorldInverse));
  box.expandByScalar(18);
  Object.assign(light.shadow.camera, {
    left: box.min.x, right: box.max.x, bottom: box.min.y, top: box.max.y, near: Math.max(0.5, -box.max.z), far: -box.min.z + 40,
  });
  light.shadow.camera.updateProjectionMatrix();
}
