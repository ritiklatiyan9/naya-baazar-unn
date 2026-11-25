import * as T from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ScenePass } from "./nightLights";

/**
 * Physically based finishing for the whole market: procedural surface textures with
 * normal and roughness detail, a sky with sun and clouds, image-based light captured
 * from that sky, and screen-space ambient occlusion.
 */

// The afternoon sun stands south-west of the courtyard at about 40° above the horizon.
export const sunDirection = new T.Vector3(-0.52, 0.66, 0.54).normalize();

// ---------------------------------------------------------------- textures

function lattice(cells: number, seed: number) {
  const values = new Float32Array(cells * cells);
  let state = (seed * 2654435761) >>> 0 || 1;
  for (let i = 0; i < values.length; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    values[i] = state / 4294967296;
  }
  return values;
}

/** Tileable fractal value noise sampled on a size × size grid, normalised to 0..1. */
function fractal(size: number, cells: number, octaves: number, seed: number, gain = .5) {
  const out = new Float32Array(size * size);
  let amplitude = 1, total = 0;
  for (let octave = 0; octave < octaves && cells <= size; octave++, cells *= 2, amplitude *= gain) {
    const grid = lattice(cells, seed + octave * 7919);
    const step = cells / size;
    for (let y = 0; y < size; y++) {
      const gy = y * step, y0 = Math.floor(gy), fy = gy - y0, v = fy * fy * (3 - 2 * fy);
      const r0 = y0 * cells, r1 = ((y0 + 1) % cells) * cells;
      for (let x = 0; x < size; x++) {
        const gx = x * step, x0 = Math.floor(gx), fx = gx - x0, u = fx * fx * (3 - 2 * fx);
        const x1 = (x0 + 1) % cells;
        const a = grid[r0 + x0], b = grid[r0 + x1], c = grid[r1 + x0], d = grid[r1 + x1];
        out[y * size + x] += amplitude * (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v);
      }
    }
    total += amplitude;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

function random(seed: number) {
  let state = seed >>> 0 || 1;
  return () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296;
}

function dataTexture(data: Uint8Array, size: number) {
  const texture = new T.DataTexture(data, size, size, T.RGBAFormat);
  texture.wrapS = texture.wrapT = T.RepeatWrapping;
  texture.magFilter = T.LinearFilter;
  texture.minFilter = T.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

/** Encodes per-channel albedo multipliers (1 = unchanged) and absolute roughness. */
function albedoTexture(size: number, sample: (i: number) => [number, number, number, number]) {
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const [r, g, b, rough] = sample(i);
    data[i * 4] = T.MathUtils.clamp(r * 127.5, 0, 255);
    data[i * 4 + 1] = T.MathUtils.clamp(g * 127.5, 0, 255);
    data[i * 4 + 2] = T.MathUtils.clamp(b * 127.5, 0, 255);
    data[i * 4 + 3] = T.MathUtils.clamp(rough * 255, 0, 255);
  }
  return dataTexture(data, size);
}

/** Tangent-space normals from a wrapped height field. Relief is in millimetres; pixel is the texel size in metres. */
function normalTexture(height: Float32Array, size: number, pixel: number) {
  const data = new Uint8Array(size * size * 4);
  const scale = .001 / (2 * pixel);
  for (let y = 0; y < size; y++) {
    const up = ((y + 1) % size) * size, down = ((y + size - 1) % size) * size;
    for (let x = 0; x < size; x++) {
      const nx = (height[y * size + (x + size - 1) % size] - height[y * size + (x + 1) % size]) * scale;
      const ny = (height[down + x] - height[up + x]) * scale;
      const length = Math.hypot(nx, ny, 1), i = (y * size + x) * 4;
      data[i] = (nx / length * .5 + .5) * 255;
      data[i + 1] = (ny / length * .5 + .5) * 255;
      data[i + 2] = (1 / length * .5 + .5) * 255;
      data[i + 3] = 255;
    }
  }
  return dataTexture(data, size);
}

export type Finish = "plaster" | "paint" | "stone" | "tile" | "terrace" | "asphalt" | "grass" | "granite" | "foliage";
type DetailSet = { albedo: T.DataTexture; normal: T.DataTexture; metres: number };
const sets = new Map<Finish, DetailSet>();

function makeSet(finish: Finish): DetailSet {
  const size = 512;
  switch (finish) {
    case "plaster": case "paint": {
      // Sand-float render: broad mottling, trowel passes and fine grain.
      const metres = finish === "paint" ? 2.4 : 3;
      const low = fractal(size, 4, 4, 11), mid = fractal(size, 24, 3, 12), grain = fractal(size, 128, 2, 13);
      const relief = finish === "paint" ? .35 : .8;
      const height = grain.map((g, i) => (.65 * g + .35 * mid[i]) * relief);
      const albedo = albedoTexture(size, i => {
        const tone = 1 + .075 * (low[i] - .5) + .05 * (mid[i] - .5) + .07 * (grain[i] - .5);
        return [tone, tone, tone * .995, .84 + .12 * (grain[i] - .5)];
      });
      return { albedo, normal: normalTexture(height, size, metres / size), metres };
    }
    case "stone": {
      // Sandstone pavers, 600 × 300 mm in running bond, chamfered edges and slight lippage.
      const metres = 2.4, px = size / metres;
      const course = .3 * px, unit = .6 * px, joint = 1.6;
      const grain = fractal(size, 96, 3, 21), cloud = fractal(size, 8, 4, 22), speck = fractal(size, 256, 1, 23);
      const rand = random(24);
      const tones = Array.from({ length: 64 }, () => [rand() - .5, rand() - .5, rand() - .5]);
      const height = new Float32Array(size * size);
      const albedo = albedoTexture(size, i => {
        const x = i % size, y = Math.floor(i / size);
        const row = Math.floor(y / course), shift = row % 2 ? unit / 2 : 0;
        const col = Math.floor((x + shift) / unit);
        const edge = Math.min((x + shift) % unit, unit - (x + shift) % unit, y % course, course - y % course);
        const [tone, hue, lip] = tones[(row * 7 + col * 13) % 64];
        const bevel = T.MathUtils.smoothstep(edge, joint * .5, joint * 2.4);
        height[i] = edge < joint ? -1.2 : (bevel - 1) * 1.1 + lip * .5 + .25 * grain[i] + .15 * speck[i];
        if (edge < joint) return [.62, .6, .58, .95];
        const shade = (1 + .16 * tone + .08 * (cloud[i] - .5) + .1 * (grain[i] - .5) + (speck[i] > .72 ? .07 : 0)) * (.9 + .1 * bevel);
        return [shade * (1 + .03 * hue), shade, shade * (1 - .04 * hue), .74 + .14 * (grain[i] - .5)];
      });
      return { albedo, normal: normalTexture(height, size, metres / size), metres };
    }
    case "tile": {
      // Polished 600 mm vitrified tiles with faint veining and narrow grout.
      const metres = 2.4, px = size / metres, unit = .6 * px, joint = 1.1;
      const vein = fractal(size, 6, 5, 31), fine = fractal(size, 64, 2, 32);
      const rand = random(33);
      const tones = Array.from({ length: 16 }, () => rand() - .5);
      const height = new Float32Array(size * size);
      const albedo = albedoTexture(size, i => {
        const x = i % size, y = Math.floor(i / size);
        const edge = Math.min(x % unit, unit - x % unit, y % unit, unit - y % unit);
        height[i] = edge < joint ? -.6 : T.MathUtils.smoothstep(edge, joint, joint * 2.2) * .4 - .4;
        if (edge < joint) return [.8, .78, .75, .7];
        const tile = tones[(Math.floor(x / unit) + 4 * Math.floor(y / unit)) % 16];
        const marble = Math.pow(1 - Math.abs(Math.sin((x * .021 + y * .013 + vein[i] * 9) * Math.PI)), 14);
        const shade = 1 + .045 * tile - .05 * marble + .025 * (fine[i] - .5);
        return [shade, shade * .997, shade * .99, .16 + .08 * fine[i]];
      });
      return { albedo, normal: normalTexture(height, size, metres / size), metres };
    }
    case "terrace": {
      // Weathered terrace finish: aggregate, 1.2 m expansion grid and old rain stains.
      const metres = 4.8, px = size / metres, bay = 1.2 * px;
      const mottle = fractal(size, 6, 4, 41), stain = fractal(size, 3, 4, 42), chip = fractal(size, 192, 1, 43);
      const fine = fractal(size, 64, 2, 44);
      const height = new Float32Array(size * size);
      const albedo = albedoTexture(size, i => {
        const x = i % size, y = Math.floor(i / size);
        const edge = Math.min(x % bay, bay - x % bay, y % bay, bay - y % bay);
        const groove = edge < 1.2;
        height[i] = groove ? -1.5 : .35 * fine[i] + (chip[i] > .7 ? .25 : 0);
        const dirt = T.MathUtils.smoothstep(stain[i], .55, .78);
        let shade = 1 + .1 * (mottle[i] - .5) + (chip[i] > .74 ? .06 : chip[i] < .26 ? -.05 : 0) - .16 * dirt;
        if (groove) shade *= .72;
        return [shade * (1 + .02 * dirt), shade, shade * (1 - .05 * dirt), .88 + .08 * fine[i]];
      });
      return { albedo, normal: normalTexture(height, size, metres / size), metres };
    }
    case "asphalt": {
      const metres = 4;
      const chips = fractal(size, 200, 2, 51), patch = fractal(size, 4, 4, 52), wear = fractal(size, 16, 3, 53);
      const height = chips.map(c => c * 2.2);
      const albedo = albedoTexture(size, i => {
        const c = chips[i];
        const stone = c > .66 ? 1.45 : c < .3 ? .78 : 1;
        const shade = stone * (1 + .2 * (patch[i] - .5)) * (1 - .1 * T.MathUtils.smoothstep(wear[i], .55, .75));
        return [shade, shade, shade * 1.01, .78 + .16 * (c - .5) - .1 * T.MathUtils.smoothstep(wear[i], .55, .75)];
      });
      return { albedo, normal: normalTexture(height, size, metres / size), metres };
    }
    case "granite": {
      // Flamed black granite skirting with mica flecks.
      const metres = 1.2;
      const speck = fractal(size, 256, 1, 61), cloud = fractal(size, 12, 3, 62);
      const height = speck.map(s => s * .3);
      const albedo = albedoTexture(size, i => {
        const s = speck[i];
        const shade = (s > .76 ? 1.9 : s > .62 ? 1.3 : s < .2 ? .7 : 1) * (1 + .15 * (cloud[i] - .5));
        return [shade, shade * .98, shade * .96, s > .76 ? .25 : .45];
      });
      return { albedo, normal: normalTexture(height, size, metres / size), metres };
    }
    case "foliage": {
      // Leaf clusters as overlapping domes, with deep shadow in the gaps between them.
      const metres = 2.2, mm = metres / size * 1000;
      const height = new Float32Array(size * size), tone = new Float32Array(size * size).fill(.32);
      const hue = new Float32Array(size * size);
      const leaf = fractal(size, 128, 2, 81), rand = random(82);
      for (let k = 0; k < 950; k++) {
        const cx = rand() * size, cy = rand() * size, r = 12 + rand() * 24, shade = .8 + .45 * rand(), warm = rand() - .5;
        for (let y = -Math.ceil(r); y <= r; y++) for (let x = -Math.ceil(r); x <= r; x++) {
          const d2 = (x * x + y * y) / (r * r);
          if (d2 > 1) continue;
          const i = ((Math.floor(cy + y) + size) % size) * size + (Math.floor(cx + x) + size) % size;
          const dome = Math.sqrt(1 - d2) * r * .55 * mm + k * .001;
          if (dome > height[i]) { height[i] = dome; tone[i] = shade * (.62 + .45 * Math.sqrt(1 - d2)); hue[i] = warm; }
        }
      }
      for (let i = 0; i < height.length; i++) height[i] += leaf[i] * 3;
      const albedo = albedoTexture(size, i => {
        const t = tone[i] * (.9 + .2 * leaf[i]);
        return [t * (1 + .18 * hue[i]), t * (1 + .06 * hue[i]), t * (1 - .2 * hue[i]), tone[i] < .4 ? .95 : .62 + .2 * leaf[i]];
      });
      return { albedo, normal: normalTexture(height, size, metres / size), metres };
    }
    case "grass": {
      // Close-mown turf drawn blade by blade, with thinner, sun-bleached patches.
      const metres = 3;
      const colour = new Float32Array(size * size * 3).fill(1);
      const height = new Float32Array(size * size);
      const patchy = fractal(size, 6, 4, 71), soil = fractal(size, 48, 2, 72);
      for (let i = 0; i < size * size; i++) {
        const bare = T.MathUtils.smoothstep(patchy[i], .62, .82) * (.6 + .4 * soil[i]);
        colour[i * 3] = .72 + .55 * bare; colour[i * 3 + 1] = .78 + .25 * bare; colour[i * 3 + 2] = .7 + .3 * bare;
      }
      const rand = random(73);
      for (let blade = 0; blade < 26000; blade++) {
        const x0 = rand() * size, y0 = rand() * size, angle = rand() * Math.PI * 2, length = 4 + rand() * 9;
        const light = rand(), dry = rand() < .18;
        const tint = dry ? [1.45, 1.3, .85] : light > .55 ? [1.12 + .25 * light, 1.28 + .2 * light, .9] : [.8, .95, .78];
        for (let s = 0; s <= length; s++) {
          const x = Math.floor(x0 + Math.cos(angle) * s + size) % size, y = Math.floor(y0 + Math.sin(angle) * s + size) % size;
          const i = y * size + x, rise = s / length;
          colour[i * 3] = tint[0] * (.8 + .3 * rise); colour[i * 3 + 1] = tint[1] * (.8 + .3 * rise); colour[i * 3 + 2] = tint[2] * (.8 + .3 * rise);
          height[i] = Math.max(height[i], 1 + 2.5 * rise);
        }
      }
      const albedo = albedoTexture(size, i => [colour[i * 3], colour[i * 3 + 1], colour[i * 3 + 2], .9 + .08 * soil[i]]);
      return { albedo, normal: normalTexture(height, size, metres / size), metres };
    }
  }
}

function detailSet(finish: Finish) {
  let set = sets.get(finish);
  if (!set) sets.set(finish, set = makeSet(finish));
  return set;
}

export type FinishOptions = {
  /** Texture set on upward faces (floors); walls and ceilings use the main set. */
  floor?: Finish;
  /** 0 keeps the material colour; 1 applies the texture's full albedo variation. */
  albedo?: number;
  /** Weight of the texture roughness against the material roughness. */
  roughness?: number;
  normal?: number;
  /** Amplitude of world-space blotches that hide the texture repeat. */
  macro?: number;
  /** Multiplies the size of the texture repeat. */
  scale?: number;
};

const finishShaderHead = `
uniform sampler2D tpAlbedo, tpNormal, tpFloorAlbedo, tpFloorNormal;
uniform vec4 tpAmounts;
uniform vec2 tpScale;
varying vec3 vTpPos;
varying vec3 vTpNormal;
float tpHash(vec3 p) {
  p = fract(p * .3183099 + vec3(.71, .113, .419));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float tpNoise(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(tpHash(i), tpHash(i + vec3(1, 0, 0)), f.x), mix(tpHash(i + vec3(0, 1, 0)), tpHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(tpHash(i + vec3(0, 0, 1)), tpHash(i + vec3(1, 0, 1)), f.x), mix(tpHash(i + vec3(0, 1, 1)), tpHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}`;

/**
 * Projects a finish onto any geometry in world space, so instanced boxes, extruded
 * slabs and hand-built quads share one continuous texture scale with no UVs.
 */
export function applyFinish<M extends T.MeshStandardMaterial>(material: M, finish: Finish, options: FinishOptions = {}): M {
  const wall = detailSet(finish), floor = detailSet(options.floor ?? finish);
  const scale = options.scale ?? 1;
  const uniforms = {
    tpAlbedo: { value: wall.albedo }, tpNormal: { value: wall.normal },
    tpFloorAlbedo: { value: floor.albedo }, tpFloorNormal: { value: floor.normal },
    tpScale: { value: new T.Vector2(1 / (wall.metres * scale), 1 / (floor.metres * scale)) },
    tpAmounts: { value: new T.Vector4(options.albedo ?? 1, options.roughness ?? 1, options.normal ?? 1, options.macro ?? .08) },
  };
  const previous = material.onBeforeCompile.bind(material);
  // Read the key now: the default key is the source of onBeforeCompile, which is about to be wrapped.
  const previousKey = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    previous(shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vTpPos;\nvarying vec3 vTpNormal;")
      .replace("#include <project_vertex>", `#include <project_vertex>
        {
          vec4 tpWorld = vec4(transformed, 1.0);
          vec3 tpN = objectNormal;
          #ifdef USE_INSTANCING
            tpWorld = instanceMatrix * tpWorld;
            tpN = mat3(instanceMatrix) * tpN;
          #endif
          tpWorld = modelMatrix * tpWorld;
          vTpPos = tpWorld.xyz;
          vTpNormal = normalize(mat3(modelMatrix) * tpN);
        }`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\n" + finishShaderHead)
      .replace("#include <map_fragment>", `#include <map_fragment>
        vec3 tpN = normalize(vTpNormal);
        vec3 tpBlend = pow(abs(tpN), vec3(5.0));
        tpBlend /= dot(tpBlend, vec3(1.0));
        float tpUp = step(0.0, tpN.y * (gl_FrontFacing ? 1.0 : -1.0));
        vec3 tpP = vTpPos * tpScale.x, tpQ = vTpPos * tpScale.y;
        vec4 tpTop = mix(texture2D(tpAlbedo, tpP.xz), texture2D(tpFloorAlbedo, tpQ.xz), tpUp);
        vec4 tpS = texture2D(tpAlbedo, tpP.zy) * tpBlend.x + tpTop * tpBlend.y + texture2D(tpAlbedo, tpP.xy) * tpBlend.z;
        float tpMacro = tpNoise(vTpPos * .29) * .65 + tpNoise(vTpPos * 1.37) * .35;
        diffuseColor.rgb *= mix(vec3(1.0), tpS.rgb * 2.0, tpAmounts.x) * (1.0 + tpAmounts.w * (tpMacro - .5) * 2.0);`)
      .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
        roughnessFactor = clamp(mix(roughnessFactor, tpS.a, tpAmounts.y), .04, 1.0);`)
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
        {
          vec3 wn = tpN * faceDirection;
          vec3 nX = texture2D(tpNormal, tpP.zy).xyz * 2.0 - 1.0;
          vec3 nY = mix(texture2D(tpNormal, tpP.xz).xyz, texture2D(tpFloorNormal, tpQ.xz).xyz, tpUp) * 2.0 - 1.0;
          vec3 nZ = texture2D(tpNormal, tpP.xy).xyz * 2.0 - 1.0;
          nX.xy *= tpAmounts.z; nY.xy *= tpAmounts.z; nZ.xy *= tpAmounts.z;
          // Whiteout blend of the three projected normal maps around the surface normal.
          nX = vec3(nX.xy + wn.zy, abs(nX.z) * wn.x);
          nY = vec3(nY.xy + wn.xz, abs(nY.z) * wn.y);
          nZ = vec3(nZ.xy + wn.xy, abs(nZ.z) * wn.z);
          vec3 tpWorldNormal = normalize(nX.zyx * tpBlend.x + nY.xzy * tpBlend.y + nZ.xyz * tpBlend.z);
          normal = normalize((viewMatrix * vec4(tpWorldNormal, 0.0)).xyz);
        }`);
  };
  material.customProgramCacheKey = () => previousKey + "|finish";
  material.needsUpdate = true;
  return material;
}

/** A standard material carrying one of the finishes. */
export function finished(finish: Finish, parameters: T.MeshStandardMaterialParameters = {}, options?: FinishOptions) {
  return applyFinish(new T.MeshStandardMaterial(parameters), finish, options);
}

// ---------------------------------------------------------------- sky

export const skyPalette = {
  day: { zenith: new T.Color("#3f74b8"), horizon: new T.Color("#c3d2dc"), haze: new T.Color("#e4dccd"),
    bounce: new T.Color("#9f968a"), sun: new T.Color("#fff1d6") },
  night: { zenith: new T.Color("#03060f"), horizon: new T.Color("#1d2740"), haze: new T.Color("#3a3238"),
    bounce: new T.Color("#141318"), sun: new T.Color("#000000") },
};

const skyVertex = `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const skyFragment = `
uniform vec3 sunDir, zenith, horizon, haze, bounce, sunColour;
uniform float night, capture, time;
varying vec3 vDir;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float hash3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = .5;
  for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.07 + vec2(1.7, 9.2); a *= .5; }
  return s;
}
void main() {
  vec3 d = normalize(vDir);
  float h = d.y, up = max(h, 0.0);
  float mu = dot(d, sunDir);
  vec3 sky = mix(horizon, zenith, pow(up, .55));
  sky = mix(sky, haze, exp(-up * 11.0) * .6);
  sky += sunColour * (.10 * pow(max(mu, 0.0), 5.0) + .55 * pow(max(mu, 0.0), 90.0)) * (1.0 - night);
  // Fair-weather cumulus on a flat cloud deck, drifting slowly downwind.
  vec2 deck = d.xz / (up + .1) * .55 + vec2(time * .0021, time * .0009);
  float shape = fbm(deck * 2.2) + .18 * fbm(deck * 9.0);
  float cover = smoothstep(.66, .92, shape) * smoothstep(.0, .2, up);
  float thick = smoothstep(.7, 1.05, shape);
  vec3 cloud = mix(vec3(.94, .93, .91), vec3(.58, .6, .66), thick * .7) * (.85 + .3 * max(mu, 0.0));
  cloud = mix(cloud, horizon * .35 + vec3(.02, .015, .012), night);
  sky = mix(sky, cloud, cover * .92);
  // Stars twinkle after dark, fading into the town glow at the horizon.
  vec3 cell = floor(d * 420.0);
  float star = step(.9982, hash3(cell)) * smoothstep(.45, .05, length(fract(d * 420.0) - .5));
  sky += night * star * smoothstep(.08, .35, up) * (.5 + .5 * sin(time * 2.3 + hash3(cell + 3.0) * 40.0)) * vec3(.9, .95, 1.0) * 1.6;
  sky += (1.0 - capture) * (1.0 - night) * sunColour * 30.0 * smoothstep(.99982, .99992, mu);
  vec3 below = mix(horizon, bounce, capture * smoothstep(0.0, -.12, h));
  gl_FragColor = vec4(h < 0.0 ? below : sky, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

function skyMaterial(capture: boolean) {
  const { day } = skyPalette;
  return new T.ShaderMaterial({
    side: T.BackSide, depthWrite: false, depthTest: false, fog: false,
    uniforms: {
      sunDir: { value: sunDirection.clone() }, zenith: { value: day.zenith.clone() }, horizon: { value: day.horizon.clone() },
      haze: { value: day.haze.clone() }, bounce: { value: day.bounce.clone() }, sunColour: { value: day.sun.clone() },
      night: { value: 0 }, capture: { value: capture ? 1 : 0 }, time: { value: 0 },
    },
    vertexShader: skyVertex, fragmentShader: skyFragment,
  });
}

function paint(material: T.ShaderMaterial, night: boolean) {
  const palette = night ? skyPalette.night : skyPalette.day;
  const u = material.uniforms;
  u.zenith.value.copy(palette.zenith); u.horizon.value.copy(palette.horizon); u.haze.value.copy(palette.haze);
  u.bounce.value.copy(palette.bounce); u.sunColour.value.copy(palette.sun); u.night.value = night ? 1 : 0;
}

/** The visible sky dome, plus day and night environment maps captured from the same sky. */
export function createSky(renderer: T.WebGLRenderer, radius: number) {
  const dome = new T.Mesh(new T.SphereGeometry(radius, 48, 24), skyMaterial(false));
  dome.name = "Sky";
  dome.frustumCulled = false;
  dome.renderOrder = -10;
  dome.userData.noAO = true;
  dome.onBeforeRender = (_renderer, _scene, camera) => { dome.position.copy(camera.position); dome.updateMatrixWorld(); };

  const pmrem = new T.PMREMGenerator(renderer);
  const captureScene = new T.Scene();
  const captureMaterial = skyMaterial(true);
  captureScene.add(new T.Mesh(new T.SphereGeometry(50, 48, 24), captureMaterial));
  const environments = [false, true].map(night => {
    paint(captureMaterial, night);
    return pmrem.fromScene(captureScene, 0, .1, 100);
  });
  captureMaterial.dispose();
  pmrem.dispose();
  return {
    dome,
    environment: (night: boolean) => environments[night ? 1 : 0].texture,
    setNight(night: boolean) { paint(dome.material, night); },
    setTime(seconds: number) { dome.material.uniforms.time.value = seconds; },
    dispose() {
      environments.forEach(target => target.dispose());
      dome.geometry.dispose();
      dome.material.dispose();
    },
  };
}

// ---------------------------------------------------------------- moving shadows

let movingShade: T.ShadowMaterial | undefined;
/**
 * Shadows of people and vehicles, which the static sun shadow map cannot follow. Drawn on the ground,
 * they appear only where the static map says that ground is sunlit, never under the arcades, and the
 * stencil darkens each pixel once however many casters overlap.
 */
export function sunShadowMaterial() {
  if (!movingShade) {
    movingShade = new T.ShadowMaterial({ color: "#1c1f2b", opacity: .55, depthWrite: false, side: T.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      stencilWrite: true, stencilRef: 1, stencilFunc: T.NotEqualStencilFunc, stencilZPass: T.ReplaceStencilOp });
    movingShade.onBeforeCompile = shader => {
      shader.fragmentShader = shader.fragmentShader.replace("( 1.0 - getShadowMask() )", "getShadowMask()");
    };
  }
  return movingShade;
}

/** Flattens world space onto the horizontal plane at `floor` along the sun, keeping a sliver of height so normals stay finite. */
export function sunProjection(target: T.Matrix4, floor: number) {
  const sx = sunDirection.x / sunDirection.y, sz = sunDirection.z / sunDirection.y, sliver = .001;
  return target.set(1, -sx, 0, sx * floor, 0, sliver, 0, floor * (1 - sliver), 0, -sz, 1, sz * floor, 0, 0, 0, 1);
}

/** Gives each opaque mesh of a moving vehicle a flattened twin that follows it across the ground. */
export function castSunShadow(vehicle: T.Object3D) {
  const sources: T.Mesh[] = [];
  vehicle.traverse(object => {
    const mesh = object as T.Mesh;
    const materials = mesh.isMesh ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : [];
    // ponytail: instanced wheels are skipped; their shadow hides under the body's.
    if (mesh.isMesh && !(mesh as T.InstancedMesh).isInstancedMesh && materials.every(m => !m.transparent)) sources.push(mesh);
  });
  const flatten = new T.Matrix4();
  for (const source of sources) {
    const twin = new T.Mesh(source.geometry, sunShadowMaterial());
    twin.name = "Sun shadow · " + vehicle.name;
    twin.frustumCulled = false;
    twin.receiveShadow = true;
    twin.matrixAutoUpdate = false;
    // A child of the vehicle hides with it; its world matrix is replaced by the projection each frame.
    twin.onBeforeRender = () => {
      twin.matrixWorld.multiplyMatrices(sunProjection(flatten, vehicle.matrixWorld.elements[13] + .012), source.matrixWorld);
    };
    vehicle.add(twin);
  }
}

// ---------------------------------------------------------------- post-processing

/** Ambient occlusion from opaque surfaces only: glass, glows and soft decals neither occlude nor receive it. */
class AmbientOcclusion extends GTAOPass {
  private hidden: T.Object3D[] = [];
  render(renderer: T.WebGLRenderer, writeBuffer: T.WebGLRenderTarget, readBuffer: T.WebGLRenderTarget, delta: number, mask: boolean) {
    this.scene.traverseVisible(object => {
      const mesh = object as T.Mesh;
      if (!mesh.isMesh) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      if (mesh.userData.noAO || materials.every(m => m.transparent || !m.visible)) this.hidden.push(mesh);
    });
    for (const object of this.hidden) object.visible = false;
    super.render(renderer, writeBuffer, readBuffer, delta, mask);
    for (const object of this.hidden) object.visible = true;
    this.hidden.length = 0;
  }
}

/** Full-quality frames: multisampled scene, ambient occlusion, night bloom, then tone mapping. */
export function createComposer(renderer: T.WebGLRenderer, scene: T.Scene, camera: T.PerspectiveCamera, occlusion: boolean) {
  const composer = new EffectComposer(renderer, new T.WebGLRenderTarget(1, 1, { type: T.HalfFloatType }));
  composer.addPass(new ScenePass(scene, camera));
  let ao: AmbientOcclusion | null = null;
  if (occlusion) {
    ao = new AmbientOcclusion(scene, camera, 1, 1);
    ao.normalMaterial.side = T.DoubleSide;
    ao.updateGtaoMaterial({ radius: .9, distanceExponent: 1.6, thickness: .8, scale: 1.25, samples: 16, distanceFallOff: 1 });
    ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 3, normalPhi: 3, radius: 8, rings: 2, samples: 16 });
    ao.blendIntensity = .8;
    composer.addPass(ao);
  }
  const bloom = new UnrealBloomPass(new T.Vector2(1, 1), .3, .25, .8);
  (bloom.highPassUniforms as Record<string, T.IUniform<number>>).smoothWidth.value = .25;
  bloom.enabled = false;
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  return {
    composer,
    render(distance: number) {
      // Contact shading stays about half a metre at eye level and broadens for aerial views. Only surfaces
      // within that depth of each other occlude, so thin objects cast no halo onto walls well behind them.
      const radius = T.MathUtils.clamp(distance * .012, .6, 4);
      ao?.updateGtaoMaterial({ radius, thickness: radius * .9 });
      composer.render();
    },
    setNight(on: boolean) { bloom.enabled = on; },
    setSize(width: number, height: number) { composer.setSize(width, height); },
    dispose() {
      composer.passes.forEach(pass => pass.dispose());
      composer.dispose();
    },
  };
}

/**
 * three's soft PCF shadows take five taps rotated per pixel by interleaved-gradient noise, a pattern meant
 * for temporal anti-aliasing. Without it every penumbra is dithered. Twelve taps on one fixed Vogel disk,
 * each a hardware-filtered comparison, give smooth penumbrae instead. Call before the first frame.
 */
export function steadyShadowFilter() {
  T.ShaderChunk.shadowmap_pars_fragment = T.ShaderChunk.shadowmap_pars_fragment.replace(
    /float phi = interleavedGradientNoise\( gl_FragCoord\.xy \) \* PI2;\s*shadow = \([\s\S]*?\) \* 0\.2;/,
    `shadow = 0.0;
    for ( int i = 0; i < 12; i ++ ) {
      shadow += texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( i, 12, 0.0 ) * radius, shadowCoord.z ) );
    }
    shadow /= 12.0;`);
}

/** Desktop GPUs get occlusion and the larger shadow map; phones keep the lighter pipeline. */
export function renderQuality(renderer: T.WebGLRenderer) {
  const coarse = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;
  const capable = !coarse && renderer.capabilities.maxTextureSize >= 8192;
  return { occlusion: capable, shadowMap: capable ? 4096 : 2048 };
}
