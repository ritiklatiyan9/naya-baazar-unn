import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export type Spillway = {
  x: number;
  y: number;
  z: number;
  width: number;
  reach: number;
};
export type FountainBay = {
  z: number;
  width: number;
  front: number;
  back: number;
  level: number;
  spillways: [Spillway, Spillway, Spillway];
};

const surfaceVertex = /* glsl */ `
  uniform float t;
  attribute vec4 flowInfo;
  varying vec2 coord;
  varying vec3 worldPoint;
  varying vec3 surfaceNormal;
  varying float phaseOffset;
  varying vec4 surfaceInfo;
  void main() {
    coord = uv;
    phaseOffset = position.z;
    surfaceInfo = flowInfo;
    vec3 point = position;
    #ifdef CASCADE
      float drop = 1.0 - uv.y;
      float travel = drop - t / flowInfo.x;
      float flutter = sin(48.0 * uv.x + 22.0 * travel + flowInfo.y);
      float drift = sin(22.0 * uv.x - 9.0 * travel + flowInfo.y);
      // Keep the lip pinned. Corrugations move down the surface along the flow.
      point.x -= smoothstep(0.0, 0.36, drop) * (0.009 * flutter + 0.007 * drift);
      point.z += drop * (0.007 * flutter + 0.006 * drift);
    #endif
    vec4 world = modelMatrix * vec4(point, 1.0);
    worldPoint = world.xyz;
    surfaceNormal = mat3(modelMatrix) * normal;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragmentHeader = /* glsl */ `
  uniform float t;
  varying vec2 coord;
  varying vec3 worldPoint;
  varying vec3 surfaceNormal;
  varying float phaseOffset;
  varying vec4 surfaceInfo;

  // Average the finer crests as they get smaller than a screen pixel.
  float shimmer(float wave, float sharpness) {
    float detail = 1.0 - smoothstep(0.45, 2.0, fwidth(wave));
    return mix(0.21, pow(0.5 + 0.5 * cos(wave), sharpness), detail);
  }

  float fresnel(vec3 normal) {
    vec3 towardEye = normalize(cameraPosition - worldPoint);
    return pow(1.0 - clamp(abs(dot(towardEye, normal)), 0.0, 1.0), 3.0);
  }
`;

const finishColor = /* glsl */ `
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const cascadeFragment = /* glsl */ `
  float hash(vec2 cell) {
    return fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
  }

  float noise(vec2 point) {
    vec2 cell = floor(point);
    vec2 blend = smoothstep(0.0, 1.0, fract(point));
    return mix(
      mix(hash(cell), hash(cell + vec2(1.0, 0.0)), blend.x),
      mix(hash(cell + vec2(0.0, 1.0)), hash(cell + 1.0), blend.x),
      blend.y
    );
  }

  void main() {
    float x = coord.x;
    float down = 1.0 - coord.y;
    float offset = surfaceInfo.y;
    // The phase follows travel time, so highlights accelerate with the falling sheet.
    float travel = down - t / surfaceInfo.x;
    float pulse = noise(vec2(12.0 * x + offset, 4.3 * travel));
    float waviness = noise(vec2(7.0 * x - offset, 3.0 * travel + 9.0));
    float channel = x + 0.024 * (waviness - 0.5) * smoothstep(0.0, 0.3, down);
    float broad = 46.0 * channel + 1.3 * sin(x * 24.0 + offset);
    float folds = shimmer(broad, 3.0);
    float narrow = 116.0 * channel + 1.3 * sin(broad * 0.57 + offset);
    float strands = shimmer(narrow + 1.2 * pulse, 6.0);
    float flecks = strands * smoothstep(0.31, 0.75, noise(vec2(41.0 * channel + offset, 11.0 * travel)));
    float impact = smoothstep(0.89, 1.0, down) * (0.6 + 0.4 * pulse);

    vec3 front = normalize(surfaceNormal);
    vec3 tangent = cross(vec3(0.0, 1.0, 0.0), front);
    vec3 normal = normalize(front + tangent * (0.22 * sin(broad) + 0.12 * (pulse - 0.5))
      + vec3(0.0, 0.19 * (waviness - 0.5) + 0.10 * sin(travel * 14.0 + broad * 0.22), 0.0));
    float grazing = fresnel(normal);
    vec3 reflected = reflect(-normalize(cameraPosition - worldPoint), normal);
    float sky = smoothstep(-0.29, 0.42, reflected.y);
    float glint = pow(max(dot(reflected, normalize(vec3(-0.48, 0.80, 0.36))), 0.0), 23.0);
    vec3 color = mix(vec3(0.094, 0.17, 0.23), vec3(0.60, 0.77, 0.89), 0.73 * sky + 0.23 * grazing);
    color += (0.26 * folds + 0.48 * flecks + 0.42 * glint + 0.17 * impact) * vec3(0.79, 0.91, 0.98);
    float edge = 0.065;
    float edges = smoothstep(0.0, edge, x) * smoothstep(0.0, edge, 1.0 - x);
    float alpha = edges * (0.14 + 0.15 * pulse + 0.19 * folds + 0.15 * strands
      + 0.20 * flecks + 0.13 * grazing + 0.11 * impact);
    gl_FragColor = vec4(color, alpha);
`;

const basinFragment = /* glsl */ `
  void main() {
    vec2 p = coord;
    float fromBack = 1.0 - p.y;
    float spacing = surfaceInfo.z;
    float source = clamp(floor((p.x - 0.5) / spacing + 0.5), -1.0, 1.0);
    float across = p.x - 0.5 - source * spacing;
    float impactDepth = mix(surfaceInfo.x, surfaceInfo.y,
      smoothstep(spacing * 0.31, spacing * 0.69 + 0.001, abs(p.x - 0.5)));
    float fromImpact = fromBack - impactDepth;
    float offset = phaseOffset * 0.43;
    float fan = length(vec2(across * 1.48, fromImpact));
    float spreading = 31.0 * fan - 7.0 * t + 0.90 * sin(30.0 * p.x + offset);
    float crossWave = 17.0 * p.x - 19.0 * p.y + 4.2 * t;
    float ring = shimmer(spreading, 3.1);
    float crossing = shimmer(crossWave, 4.3);
    float turbulent = exp(-4.5 * abs(fromImpact));

    // Moving normals change the reflected sky and distort the submerged joints.
    float slope = sin(spreading) * (0.085 + 0.14 * turbulent);
    vec3 normal = normalize(surfaceNormal + vec3(slope, 0.0, sin(crossWave) * 0.13));
    vec3 reflected = reflect(-normalize(cameraPosition - worldPoint), normal);
    float reflection = 0.11 + 0.50 * fresnel(normal) + 0.20 * smoothstep(0.01, 0.42, reflected.y);
    vec2 mosaic = fract(p * vec2(26.0, 10.0) + 0.15 * vec2(sin(crossWave), sin(spreading)));
    float tile = smoothstep(0.025, 0.085, min(mosaic.x, mosaic.y));
    vec3 depth = mix(vec3(0.015, 0.035, 0.038), vec3(0.022, 0.080, 0.092), tile);
    vec3 color = mix(depth, vec3(0.36, 0.51, 0.55), reflection);
    color += (0.24 * ring * (0.48 + 0.52 * turbulent) + 0.10 * crossing) * vec3(0.69, 0.90, 0.92);
    float bubbles = shimmer(122.0 * p.x + 2.3 * sin(29.0 * p.y - 7.0 * t + offset), 2.6);
    float plume = 1.0 - smoothstep(surfaceInfo.w * 0.55, surfaceInfo.w + 0.06, abs(across));
    float foam = exp(-16.0 * abs(fromImpact)) * plume * (0.29 + 0.36 * ring + 0.32 * bubbles);
    color = mix(color, vec3(0.70, 0.83, 0.84), foam);
    gl_FragColor = vec4(color, 1.0);
`;

function addSurface(parent: T.Group, pieces: T.BufferGeometry[], time: T.IUniform<number>, falling: boolean) {
  const mesh = new T.Mesh(mergeGeometries(pieces)!, new T.ShaderMaterial({
    uniforms: { t: time },
    defines: falling ? { CASCADE: 1 } : {},
    vertexShader: surfaceVertex,
    fragmentShader: fragmentHeader + (falling ? cascadeFragment : basinFragment) + finishColor,
    transparent: falling,
    depthWrite: !falling,
    side: falling ? T.DoubleSide : T.FrontSide,
    forceSinglePass: true,
  }));
  mesh.name = falling ? "Falling water curtains" : "Rippled fountain basins";
  mesh.renderOrder = falling ? 2 : 0;
  parent.add(mesh);
  pieces.forEach(piece => piece.dispose());
}

function addSplash(parent: T.Group, bays: FountainBay[], time: T.IUniform<number>) {
  const anchors: number[] = [], motion: number[] = [], cycle: number[] = [];
  let seed = 491;
  function random() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  for (const { front, level, spillways } of bays) {
    for (const { x, z, reach, width } of spillways) {
      const span = width * 0.8;
      const count = Math.ceil(width * 58);
      for (let i = 0; i < count; i++) {
        const along = (i + random()) / count - 0.5;
        const origin = x - reach - random() * 0.074;
        const run = Math.min(origin - front - 0.042, 0.058 + random() * 0.43);
        anchors.push(origin, level + 0.012, z + along * (span - 0.16));
        motion.push(run, 0.044 + random() ** 1.65 * 0.218, (random() - 0.5) * 0.16);
        cycle.push(random(), 1.72 + random() * 1.35, 0.013 + random() ** 1.42 * 0.039);
      }
    }
  }
  const quad = new T.PlaneGeometry();
  const geometry = new T.InstancedBufferGeometry();
  geometry.setIndex(quad.getIndex()!.clone());
  geometry.setAttribute("position", quad.getAttribute("position").clone());
  geometry.setAttribute("uv", quad.getAttribute("uv").clone());
  quad.dispose();
  const impactPoints = new T.InstancedBufferAttribute(new Float32Array(anchors), 3);
  geometry.setAttribute("impactPoint", impactPoints);
  geometry.setAttribute("motion", new T.InstancedBufferAttribute(new Float32Array(motion), 3));
  geometry.setAttribute("cycle", new T.InstancedBufferAttribute(new Float32Array(cycle), 3));
  geometry.instanceCount = anchors.length / 3;
  // Culling must cover the animated particles, whose origins live outside the base quad.
  geometry.boundingSphere = new T.Box3().setFromBufferAttribute(impactPoints).expandByScalar(.55)
    .getBoundingSphere(new T.Sphere());
  const material = new T.ShaderMaterial({
    uniforms: { t: time },
    vertexShader: /* glsl */ `
      uniform float t;
      attribute vec3 impactPoint;
      attribute vec3 motion;
      attribute vec3 cycle;
      varying vec2 coord;
      varying float opacity;
      void main() {
        float age = fract(t * cycle.y + cycle.x);
        float arc = 4.0 * age * (1.0 - age);
        vec3 point = impactPoint + vec3(-motion.x * age, motion.y * arc, motion.z * age);
        vec4 eye = modelViewMatrix * vec4(point, 1.0);
        eye.xy += position.xy * cycle.z * vec2(0.76, 1.16);
        coord = uv;
        opacity = smoothstep(0.0, 0.15, age) * (1.0 - smoothstep(0.62, 1.0, age));
        gl_Position = projectionMatrix * eye;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 coord;
      varying float opacity;
      void main() {
        float distance = length(coord - 0.5) * 2.0;
        float bead = 1.0 - smoothstep(0.18, 1.0, distance);
        gl_FragColor = vec4(0.79, 0.91, 0.93, 0.76 * opacity * bead);
    ` + finishColor,
    transparent: true,
    depthWrite: false,
  });
  const splash = new T.Mesh(geometry, material);
  splash.name = "Water droplets above the basins";
  splash.renderOrder = 3;
  parent.add(splash);
}

function setFlowInfo(geometry: T.BufferGeometry, info: [number, number, number, number]) {
  const count = geometry.getAttribute("position").count;
  const values = new Float32Array(4 * count);
  for (let i = 0; i < count; i++) values.set(info, i * 4);
  geometry.setAttribute("flowInfo", new T.BufferAttribute(values, 4));
  return geometry;
}

/** Projected spillways leave the stone horizontally and accelerate down into the basin. */
function waterfall(outlet: Spillway, level: number) {
  const { x, y, z, width, reach } = outlet;
  const height = y - level + .009;
  const geometry = new T.PlaneGeometry(1, 1, 26, 32);
  const position = geometry.getAttribute("position");
  const uv = geometry.getAttribute("uv");
  for (let i = 0; i < position.count; i++) {
    const progress = 1 - uv.getY(i);
    const drop = progress * (.11 + .89 * progress);
    const taper = 1 - .21 * progress;
    position.setXYZ(i, x - reach * progress, y - height * drop, z + (uv.getX(i) - .5) * width * taper);
  }
  geometry.computeVertexNormals();
  const duration = Math.sqrt(2 * height / 9.81);
  return setFlowInfo(geometry, [duration, z * .73 + y * 1.12, 0, 0]);
}

function basinSurface({ z, width, front, back, level, spillways: [outer, centre] }: FountainBay) {
  const depth = back - front;
  const distance = (outlet: Spillway) => (back - outlet.x + outlet.reach) / depth;
  const geometry = new T.PlaneGeometry(width, depth).rotateY(-Math.PI / 2).rotateZ(-Math.PI / 2)
    .translate(back - depth / 2, level, z);
  return setFlowInfo(geometry, [
    distance(centre), distance(outer), (centre.z - outer.z) / width, outer.width * .44 / width,
  ]);
}

export function addFountainWater(parent: T.Group, bays: FountainBay[]) {
  const time = { value: 0 };
  const curtains = bays.flatMap(({ level, spillways }) =>
    spillways.map(outlet => waterfall(outlet, level)));
  addSurface(parent, bays.map(basinSurface), time, false);
  addSurface(parent, curtains, time, true);
  addSplash(parent, bays, time);
  return (seconds: number) => { time.value = seconds; };
}
