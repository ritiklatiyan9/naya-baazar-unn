import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { skyPalette } from "./realism";

/**
 * Life in the sky over the market, all on the market clock: a loose flock of pigeons circling the
 * courtyard, a pair of house crows, black kites soaring on thermals and, every few minutes, a
 * narrow-body jet crossing the upper sky with its contrail. Birds keep above the roofs and clear of
 * the high masts and the courtyard viewpoint; nothing is random, so every visit sees the same sky.
 */

const hash = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

// ---------------------------------------------------------------- birds

type Paint = (span: number, z: number, top: boolean) => string;

/** One coloured piece of a bird; `wing` marks the vertices the flapping shader turns. */
function piece(geometry: T.BufferGeometry, paint: Paint, wing = 0) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  g.deleteAttribute("uv");
  const p = g.getAttribute("position"), n = g.getAttribute("normal"), c = new T.Color();
  const colour = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) c.set(paint(Math.abs(p.getX(i)), p.getZ(i), n.getY(i) > 0)).toArray(colour, i * 3);
  g.setAttribute("color", new T.BufferAttribute(colour, 3));
  g.setAttribute("wing", new T.BufferAttribute(new Float32Array(p.count).fill(wing), 1));
  return g;
}

/** A flat piece with the given outline (x across, z forward) and thickness, lying level at height y. */
function slab(outline: number[][], thickness: number, y = 0) {
  return new T.ExtrudeGeometry(new T.Shape(outline.map(([x, z]) => new T.Vector2(x, z))), { depth: thickness, bevelEnabled: false })
    .rotateX(Math.PI / 2).translate(0, y + thickness / 2, 0);
}

const ellipsoid = (rx: number, ry: number, rz: number, y: number, z: number) => new T.SphereGeometry(1, 10, 7).scale(rx, ry, rz).translate(0, y, z);
const pair = (outline: number[][], thickness: number, y: number, paint: Paint) =>
  [1, -1].map(side => piece(slab(outline.map(([x, z]) => [x * side, z]), thickness, y), paint, 1));

/** Rock dove, 0.32 m long with a 0.66 m span: blue-grey, dark head and wingtips, tail band, pale underwing. */
function pigeonGeometry() {
  const grey: Paint = (_x, _z, top) => top ? "#8a929c" : "#8e959e";
  const wing = [[.02, .035], [.1, .046], [.16, .042], [.24, .012], [.335, -.055], [.3, -.075], [.22, -.086], [.16, -.08], [.09, -.074], [.02, -.06]];
  return mergeGeometries([
    piece(ellipsoid(.042, .04, .085, 0, 0), grey),
    piece(ellipsoid(.03, .033, .045, .014, .066), () => "#5d6a69"),
    piece(ellipsoid(.021, .023, .026, .03, .108), () => "#565e67"),
    piece(slab([[-.022, -.055], [.022, -.055], [.05, -.19], [-.05, -.19]], .008, .004), (_x, z) => z < -.155 ? "#2c3035" : "#7b838d"),
    ...pair(wing, .01, .006, (x, _z, top) => x > .28 ? (top ? "#363b41" : "#6d737a") : x > .16 ? (top ? "#68707a" : "#a2a8af") : (top ? "#97a0aa" : "#b2b8bf")),
  ])!;
}

/** Black kite, 0.58 m long with a 1.5 m span: dark brown, long fingered wings with a pale patch under the hand, forked tail. */
function kiteGeometry() {
  const brown: Paint = (_x, _z, top) => top ? "#5b4838" : "#4c3c30";
  const wing = [[.045, .09], [.2, .112], [.34, .12], [.5, .078], [.64, .03], [.735, -.025], [.745, -.07], [.715, -.12],
    [.66, -.15], [.52, -.2], [.34, -.225], [.18, -.215], [.045, -.155]];
  return mergeGeometries([
    piece(ellipsoid(.068, .062, .165, 0, 0), brown),
    piece(ellipsoid(.05, .055, .08, .012, .125), brown),
    piece(ellipsoid(.04, .042, .05, .03, .205), () => "#7d6a55"),
    piece(slab([[-.035, -.13], [.035, -.13], [.11, -.42], [.052, -.39], [0, -.355], [-.052, -.39], [-.11, -.42]], .012, .004),
      (_x, _z, top) => top ? "#5a4636" : "#6a5644"),
    ...pair(wing, .018, .01, (x, _z, top) => x > .62 ? "#2b231d" : x > .42 ? (top ? "#40342a" : "#8a7966") : (top ? "#5e4b3a" : "#4a3b2f")),
  ])!;
}

/** Feathers, with each wing turning at the shoulder and again at the wrist by a per-bird pose (arm, hand angles). */
function birdMaterial(shoulder: number, wrist: number) {
  const material = new T.MeshStandardMaterial({ vertexColors: true, roughness: .85 });
  const s = shoulder.toFixed(3), w = wrist.toFixed(3);
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>
        attribute float wing;
        attribute vec2 wingPose;
        vec2 turnWing(vec2 v, float a) { float c = cos(a), s = sin(a); return vec2(c * v.x - s * v.y, s * v.x + c * v.y); }`)
      .replace("#include <beginnormal_vertex>", `#include <beginnormal_vertex>
        vec2 wingSide = vec2(position.x < 0.0 ? -1.0 : 1.0, 1.0);
        float armTurn = wing * wingPose.x, handTurn = wing * step(${w}, abs(position.x)) * wingPose.y;
        objectNormal.xy = turnWing(objectNormal.xy * wingSide, armTurn + handTurn) * wingSide;`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        vec2 wingAt = transformed.xy * wingSide;
        wingAt = turnWing(wingAt - vec2(${w}, 0.0), handTurn) + vec2(${w}, 0.0);
        wingAt = turnWing(wingAt - vec2(${s}, 0.0), armTurn) + vec2(${s}, 0.0);
        transformed.xy = wingAt * wingSide;`);
  };
  material.customProgramCacheKey = () => `bird${s}/${w}`;
  return material;
}

type Path = (t: number, out: T.Vector3) => T.Vector3;
// Flapping: arm angle, arm amplitude, hand amplitude, hand lag behind the arm; gliding: arm and hand angles; beats per second.
type Flight = { flap: [number, number, number, number]; glide: [number, number]; hz: number };
type Flier = { path: Path; flight: Flight; scale: number; phase: number; rate: number; flapping: (t: number) => number };

const pigeonFlight: Flight = { flap: [.12, .78, .42, .9], glide: [.42, -.2], hz: 5.6 };
const crowFlight: Flight = { flap: [.1, .6, .35, .9], glide: [.12, -.05], hz: 3.9 };
const kiteFlight: Flight = { flap: [.1, .38, .22, .7], glide: [.07, -.12], hz: 2.5 };

function flock(name: string, geometry: T.BufferGeometry, material: T.Material, fliers: Flier[]) {
  geometry.setAttribute("wingPose", new T.InstancedBufferAttribute(new Float32Array(fliers.length * 2), 2).setUsage(T.DynamicDrawUsage));
  const mesh = new T.InstancedMesh(geometry, material, fliers.length);
  mesh.name = name;
  mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.userData.noAO = true;
  return { mesh, fliers };
}

const before = new T.Vector3(), here = new T.Vector3(), after = new T.Vector3();
const ahead = new T.Vector3(), lift = new T.Vector3(), across = new T.Vector3(), size = new T.Vector3(), placed = new T.Matrix4();
const step = .04, gravity = 9.81;

/** Each bird on its path, banked as a flier is (its lift carries its weight and its turn), wings at this instant of the beat. */
function fly({ mesh, fliers }: ReturnType<typeof flock>, t: number) {
  const pose = mesh.geometry.getAttribute("wingPose") as T.InstancedBufferAttribute;
  for (let i = 0; i < fliers.length; i++) {
    const { path, flight: { flap, glide, hz }, scale, phase, rate, flapping } = fliers[i];
    path(t - step, before); path(t, here); path(t + step, after);
    ahead.subVectors(after, before).normalize();
    lift.addVectors(after, before).addScaledVector(here, -2).divideScalar(step * step);
    lift.y += gravity;
    lift.addScaledVector(ahead, -lift.dot(ahead)).normalize();
    across.crossVectors(lift, ahead);
    mesh.setMatrixAt(i, placed.makeBasis(across, lift, ahead).scale(size.setScalar(scale)).setPosition(here));
    const beat = 2 * Math.PI * hz * rate * t + phase, w = flapping(t);
    pose.setXY(i, T.MathUtils.lerp(glide[0], flap[0] + flap[1] * Math.sin(beat), w), T.MathUtils.lerp(glide[1], flap[2] * Math.sin(beat - flap[3]), w));
  }
  mesh.instanceMatrix.needsUpdate = pose.needsUpdate = true;
}

function birds() {
  // Pigeons lap the courtyard on an oval 52–90 m long, its long axis towards the entrance, a couple of storeys above
  // the roofs: 12–20 m up at the open entrance end, 15–23 m over the rooftop tanks at the other. They pass 6 m or more
  // from the courtyard mast and 13 m from the courtyard viewpoint, and cross the entrance view's sky about 30 m out and
  // the courtyard view below its camera, where a pigeon stays readable.
  const pigeons: Flier[] = Array.from({ length: 24 }, (_, i) => {
    const [lag, out, up, p1, p2, p3, p4, p5] = [0, 1, 2, 3, 4, 5, 6, 7].map(k => hash(i * 8 + k));
    return {
      flight: pigeonFlight, scale: .94 + .12 * hash(i + 300), phase: p4 * 40, rate: .9 + .2 * hash(i + 400),
      path: (t, o) => {
        const a = -.45 * t + 1.1 * lag + .3 * Math.sin(.11 * t + 6.3 * p1);
        const r = 1 + .06 * Math.sin(.07 * t + 1.3) + .12 * (out - .5) + .02 * Math.sin(.17 * t + 6.3 * p2);
        const u = 40 * r * Math.cos(a), v = 27 * r * Math.sin(a);
        return o.set(-4.2 + 2 * Math.sin(.023 * t) - .795 * u + .606 * v, 17.5 - 1.5 * Math.cos(a) + 2 * Math.sin(.045 * t + .7) + 2.4 * (up - .5) + .8 * Math.sin(.21 * t + 6.3 * p3),
          9.4 + 2 * Math.cos(.019 * t) + .606 * u + .795 * v);
      },
      // About a quarter of the time each bird glides on raised wings for a second or two.
      flapping: t => T.MathUtils.smoothstep(Math.sin(.8 * t + 6.3 * p4) + .7 * Math.sin(.31 * t + 6.3 * p5), -.35, .15),
    };
  });
  // A pair of house crows rows a lazy figure of eight over the east end of the market and the trees beyond, 20–25 m up,
  // through the sky at the far end of the street view.
  const crows: Flier[] = [0, 1].map(k => ({
    flight: crowFlight, scale: 1.3, phase: k * 2.1, rate: 1 + .07 * k,
    path: (t, o) => {
      const a = .3 * (t - .6 * k);
      return o.set(95 + 30 * Math.sin(a) + 1.3 * k, 22 + 2 * Math.sin(.37 * (t - .6 * k)) + k, 22 + 14 * Math.sin(2 * a) - .9 * k);
    },
    flapping: t => T.MathUtils.smoothstep(Math.sin(.5 * t + 2 * k), -.85, -.65),
  }));
  // Black kites ride thermals in wide circles that wander and tilt with the wind, each where a view will find it:
  // 55–85 m up east of the street's far end and north over the delivery road, 115–150 m up north-east of the
  // entrance, and 80–110 m over the market itself, below the overview camera and above anyone looking up.
  const thermals = [[200, 45, 42, 68, 1], [41, -175, 45, 70, -1], [184, -119, 60, 130, 1], [-10, 0, 60, 95, -1]];
  const kites: Flier[] = thermals.map(([x, z, radius, height, spin], i) => {
    const [p0, p1, p2, p3, p4, p5] = [0, 1, 2, 3, 4, 5].map(k => 6.3 * hash(100 + i * 6 + k));
    return {
      flight: kiteFlight, scale: .95 + .04 * i, phase: p5, rate: .9 + .07 * i,
      path: (t, o) => {
        const a = spin * 10 / radius * t + p0, r = radius * (1 + .12 * Math.sin(.05 * t + p3));
        return o.set(x + 10 * Math.sin(.004 * t + p1) + r * Math.cos(a), height + .15 * height * Math.sin(.013 * t + p4) + 4 * Math.sin(a + p5),
          z + 10 * Math.cos(.0035 * t + p2) + r * Math.sin(a));
      },
      // Long glides; now and then a few slow beats.
      flapping: t => T.MathUtils.smoothstep(.55 * Math.sin(.21 * t + p1) + .45 * Math.sin(.083 * t + p2), .82, .97),
    };
  });
  return [
    flock("Pigeons and crows", pigeonGeometry(), birdMaterial(.02, .16), [...pigeons, ...crows]),
    flock("Black kites", kiteGeometry(), birdMaterial(.045, .34), kites),
  ];
}

// ---------------------------------------------------------------- airliner

/** A twin-engine narrow-body jet, 38 m long with a 36 m span, +z forward: white with a light grey belly and wings. */
function jetGeometry() {
  const paint = (geometry: T.BufferGeometry, colour: (y: number) => string) => {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    g.deleteAttribute("uv");
    const p = g.getAttribute("position"), c = new T.Color(), colours = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) c.set(colour(p.getY(i))).toArray(colours, i * 3);
    g.setAttribute("color", new T.BufferAttribute(colours, 3));
    return g;
  };
  const fuselage = new T.LatheGeometry([[0, -19], [.45, -18.8], [1.1, -16.6], [1.62, -13.6], [1.95, -10], [1.97, 10.5], [1.86, 13.8],
    [1.55, 16.2], [1.02, 17.8], [.42, 18.75], [0, 19]].map(([r, z]) => new T.Vector2(r, z)), 18).rotateX(Math.PI / 2);
  // The tail cone sweeps up towards the APU exhaust.
  const p = fuselage.getAttribute("position");
  for (let i = 0; i < p.count; i++) { const s = T.MathUtils.clamp((-10 - p.getZ(i)) / 9, 0, 1); p.setY(i, p.getY(i) + .75 * s * s); }
  const wing = [[1.5, 4], [6.5, 1.45], [17.4, -4], [17.4, -5.6], [6.5, -3.1], [1.5, -3.1]];
  const tailplane = [[.9, -13.9], [6.3, -17.4], [6.3, -18.5], [.9, -17.5]];
  const grey = () => "#c4cad1";
  const parts = [
    paint(fuselage, y => y < -1.1 ? "#c9ced5" : "#f2f3f5"),
    paint(slab([[1.4, -12.6], [8.3, -16.9], [8.3, -18.7], [1.4, -18.3]], .3, -.15).rotateZ(Math.PI / 2), () => "#eef0f2"),
  ];
  for (const side of [1, -1]) {
    const mirror = (outline: number[][]) => outline.map(([x, z]) => [x * side, z]);
    parts.push(
      paint(slab(mirror(wing), .45, -1).rotateZ(side * .087), grey),
      paint(slab(mirror(tailplane), .28, .75).rotateZ(side * .1), grey),
      paint(new T.BoxGeometry(.14, 2.1, 1.3).translate(side * 17.45, 1.75, -5.2), grey),
      paint(new T.CylinderGeometry(1.05, .8, 4.2, 14).rotateX(Math.PI / 2).translate(side * 5.75, -1.75, 4.4), () => "#e3e6e9"),
      paint(new T.BoxGeometry(.35, .7, 3.2).translate(side * 5.75, -.75, 3.1), grey),
    );
  }
  return mergeGeometries(parts)!;
}

// Contrails form about a fuselage length behind the engines, then spread and thin out over 3.5 km.
const trailStart = 22, trailLength = 3500, engineX = 5.75, engineY = -1.75;

/** Two ribbons behind the engines, each a strip of centre points the vertex shader widens towards the camera. */
function contrailGeometry() {
  const position: number[] = [], trail: number[] = [], index: number[] = [];
  const steps = 48;
  for (const x of [-engineX, engineX]) {
    const base = position.length / 3;
    for (let j = 0; j <= steps; j++) {
      const s = trailStart + (trailLength - trailStart) * Math.pow(j / steps, 1.8);
      for (const side of [-1, 1]) { position.push(x, engineY, -s); trail.push(side, s); }
      if (j) { const a = base + 2 * (j - 1); index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute("position", new T.Float32BufferAttribute(position, 3));
  geometry.setAttribute("trail", new T.Float32BufferAttribute(trail, 2));
  geometry.setIndex(index);
  return geometry;
}

// Haze between the ground and the jet: about a quarter of its contrast is lost at 3 km and all of it by 12 km.
const airHaze = .00016;

function contrailMaterial() {
  return new T.ShaderMaterial({
    transparent: true, depthWrite: false, side: T.DoubleSide, fog: false,
    uniforms: { pixel: { value: .001 }, colour: { value: new T.Color(.86, .86, .85) }, fade: { value: 1 } },
    vertexShader: `
      uniform float pixel, fade;
      attribute vec2 trail;
      varying float across, alpha;
      void main() {
        vec4 centre = modelViewMatrix * vec4(position, 1.0);
        vec3 axis = (modelViewMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xyz;
        float scale = length(axis), s = trail.y;
        // Widen square to the line of sight, never below a pixel each side: thinner trails just fade.
        float width = (1.2 + .012 * s) * scale, least = pixel * -centre.z;
        float far = length(centre.xyz) / scale;
        alpha = .85 * fade * smoothstep(${trailStart.toFixed(1)}, ${(trailStart + 120).toFixed(1)}, s) * exp(-s / 1500.0)
          * (1.0 - smoothstep(.7, 1.0, s / ${trailLength.toFixed(1)})) * min(width / least, 1.0) * exp(-pow(${airHaze} * far, 2.0));
        across = trail.x;
        centre.xyz += normalize(cross(axis, centre.xyz)) * trail.x * max(width, least);
        gl_Position = projectionMatrix * centre;
      }`,
    fragmentShader: `
      uniform vec3 colour;
      varying float across, alpha;
      void main() {
        gl_FragColor = vec4(colour, alpha * exp(-3.0 * across * across));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

/** A soft round dot for the navigation lights. */
function glowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 32;
  const c = canvas.getContext("2d")!, glow = c.createRadialGradient(16, 16, 0, 16, 16, 16);
  glow.addColorStop(0, "rgba(255,255,255,1)");
  glow.addColorStop(.35, "rgba(255,255,255,.55)");
  glow.addColorStop(1, "rgba(255,255,255,0)");
  c.fillStyle = glow;
  c.fillRect(0, 0, 32, 32);
  return new T.CanvasTexture(canvas);
}

// Navigation lights (+x is the left wing): position, colour, and 0 steady, 1 strobe or 2 beacon. Red and green wingtips,
// white wingtip strobes, a white tail light and red beacons above and below the fuselage.
const navLights = [
  [17.6, .8, -5, 2.2, .12, .06, 0], [-17.6, .8, -5, .1, 1.8, .4, 0], [17.7, .8, -5.7, 5, 5, 5, 1], [-17.7, .8, -5.7, 5, 5, 5, 1],
  [0, .85, -19.1, 1.2, 1.2, 1.2, 0], [0, 2.05, -1, 3.2, .19, .08, 2], [0, -2.05, 1.5, 3.2, .19, .08, 2],
];

// Three tracks in turn, each 20 km long at 160 m/s, 1.3–1.4 km up and 2.6–3.6 km out at their closest, so the jet
// crosses the open sky of the walking views 20–28° up: north-west to south-east past the entrance and delivery views,
// south to north through the gap at the far end of the street, then south-west to north-east past the gallery.
const passes = [[42, 2600, 1300, 132], [100, 3600, 1350, 10], [-40, 3000, 1400, 50]].map(([bearing, range, height, course]) => {
  const b = T.MathUtils.degToRad(bearing), c = T.MathUtils.degToRad(course);
  return { closest: new T.Vector3(range * Math.sin(b), height, -range * Math.cos(b)), heading: new T.Vector3(Math.sin(c), 0, -Math.cos(c)) };
});
// The first pass is already under way when the market opens.
const firstPass = -25, period = 165, speed = 160, reach = 10000, crossing = 2 * reach / speed;

function airliner() {
  const group = new T.Group();
  group.name = "Airliner";
  const haze = { colour: { value: new T.Color() }, amount: { value: 0 } };
  const finish = new T.MeshStandardMaterial({ vertexColors: true, roughness: .38, metalness: .05, fog: false });
  // Distance blends the jet into the sky behind it, before tone mapping like the sky itself.
  finish.onBeforeCompile = shader => {
    shader.uniforms.hazeColour = haze.colour;
    shader.uniforms.hazeAmount = haze.amount;
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec3 hazeColour;\nuniform float hazeAmount;")
      .replace("#include <tonemapping_fragment>", "gl_FragColor.rgb = mix(gl_FragColor.rgb, hazeColour, hazeAmount);\n#include <tonemapping_fragment>");
  };
  const body = new T.Mesh(jetGeometry(), finish);
  const trail = new T.Mesh(contrailGeometry(), contrailMaterial());
  const viewport = new T.Vector4();
  // One pixel's width at unit depth, for the contrail's minimum width.
  trail.onBeforeRender = (renderer, _scene, camera) => {
    renderer.getCurrentViewport(viewport);
    trail.material.uniforms.pixel.value = 2 / ((camera as T.PerspectiveCamera).projectionMatrix.elements[5] * viewport.w);
  };
  const spots = new T.BufferGeometry();
  spots.setAttribute("position", new T.Float32BufferAttribute(navLights.flatMap(l => l.slice(0, 3)), 3));
  spots.setAttribute("color", new T.BufferAttribute(new Float32Array(navLights.length * 3), 3).setUsage(T.DynamicDrawUsage));
  const lights = new T.Points(spots, new T.PointsMaterial({
    size: 4, sizeAttenuation: false, map: glowTexture(), vertexColors: true, transparent: true, depthWrite: false,
    blending: T.AdditiveBlending, fog: false,
  }));
  for (const part of [body, trail, lights]) { part.frustumCulled = false; part.userData.noAO = true; }
  trail.renderOrder = 1;
  group.add(body, trail, lights);

  const at = new T.Vector3(), tail = new T.Vector3(), look = new T.Vector3(), { day } = skyPalette;
  return {
    group,
    /** Places the jet for market time t, or hides it between passes. */
    update(t: number, night: boolean) {
      const lap = Math.floor((t - firstPass) / period), since = t - firstPass - lap * period;
      const flying = since < crossing;
      body.visible = trail.visible = flying && !night;
      lights.visible = flying && night;
      if (!flying) return;
      const { closest, heading } = passes[((lap % passes.length) + passes.length) % passes.length];
      at.copy(closest).addScaledVector(heading, speed * since - reach);
      tail.copy(at).addScaledVector(heading, -trailLength);
      // Drawn scaled towards the market, so it keeps its true size and direction yet stays inside the far plane.
      const scale = Math.min(1, 3600 / Math.max(at.length(), tail.length()));
      group.position.copy(at).multiplyScalar(scale);
      group.scale.setScalar(scale);
      group.rotation.y = Math.atan2(heading.x, heading.z);
      const fade = T.MathUtils.smoothstep(since, 0, 10) * (1 - T.MathUtils.smoothstep(since, crossing - 10, crossing));
      // The sky colour along the line of sight, as the sky dome paints it, is what the haze tends to.
      look.copy(at).normalize();
      const up = Math.max(look.y, 0);
      haze.colour.value.copy(day.horizon).lerp(day.zenith, Math.pow(up, .55)).lerp(day.haze, Math.exp(-up * 11) * .6);
      haze.amount.value = 1 - fade * Math.exp(-Math.pow(airHaze * at.length(), 2));
      trail.material.uniforms.fade.value = fade;
      if (!night) return;
      // Steady wingtip and tail lights, a double white strobe every 1.2 s and a red beacon once a second.
      const strobe = t % 1.2 < .07 || (t % 1.2 > .17 && t % 1.2 < .24) ? 1 : 0, beacon = (t + .5) % 1 < .13 ? 1 : 0;
      const colour = spots.getAttribute("color") as T.BufferAttribute;
      for (let i = 0; i < navLights.length; i++) {
        const l = navLights[i], k = fade * (l[6] === 1 ? strobe : l[6] === 2 ? beacon : 1);
        colour.setXYZ(i, l[3] * k, l[4] * k, l[5] * k);
      }
      colour.needsUpdate = true;
    },
  };
}

// ---------------------------------------------------------------- sky life

export function addSkyLife(parent: T.Object3D) {
  const group = new T.Group();
  group.name = "Sky life";
  const flocks = birds(), jet = airliner();
  group.add(...flocks.map(f => f.mesh), jet.group);
  parent.add(group);
  let night = false, time = 0;
  const setTime = (t: number) => {
    time = t;
    // Birds roost after dark.
    for (const f of flocks) { f.mesh.visible = !night; if (!night) fly(f, t); }
    jet.update(t, night);
  };
  group.userData.night = (on: boolean) => { night = on; setTime(time); };
  setTime(0);
  return { setTime };
}
