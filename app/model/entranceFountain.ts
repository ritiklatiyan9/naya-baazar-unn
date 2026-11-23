import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { addFountainWater, type FountainBay, type Spillway } from "./fountainWater";
import { Parts, prism } from "./geometry";
import { eastFacadeAt, entranceSign, fountainGaps, fountainPanels as panels, fountainWallEnd, fountainWallFace as face } from "./entranceLayout";
import { facadeFinish } from "./siteMaterials";

const wallBack = face + .31;
const wall = { minX: face, maxX: wallBack, minZ: eastFacadeAt(wallBack) - .015, maxZ: fountainWallEnd };
const wallTop = 2.78;
const panelTop = 2.57, poolLevel = .496, rim = .543;
const fountains = panels.map(({ z, width }, index) => ({
  z,
  width,
  staggered: index === 1 || index === 4,
  pool: { minX: face - 1.15, maxX: face + .04, minZ: z - width / 2 - .08, maxZ: z + width / 2 + .08 },
}));
export const entranceFountainFootprints = [wall, ...fountains.map(({ pool }) => pool)];

function randomSequence(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

// Cut each layer on the same diagonal as the mart shell. The small lap closes the construction joint.
function cladWall(group: T.Group) {
  function layer(name: string, front: number, back: number, end: number, base: number, top: number, color: string) {
    const corners = [
      new T.Vector2(front, eastFacadeAt(front) - .015), new T.Vector2(back, eastFacadeAt(back) - .015),
      new T.Vector2(back, end), new T.Vector2(front, end),
    ];
    const mesh = new T.Mesh(prism(corners, base, top - base), new T.MeshStandardMaterial({ color, roughness: .85 }));
    mesh.name = name;
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  }
  layer("Market plaster boundary wall", face, wallBack, wall.maxZ, .06, wallTop, facadeFinish.plaster);
  layer("Wall coping", face - .035, wallBack + .035, wall.maxZ + .035, wallTop, wallTop + .055, facadeFinish.edge);
  layer("Wall plinth", face - .012, wallBack + .012, wall.maxZ + .012, .06, .22, facadeFinish.lining);
}

type Point = [number, number, number];

/** Each split-faced stone has an uneven front, projecting top lip and recessed end joints. */
function ledgestone(group: T.Group) {
  const vertices: number[] = [], colors: number[] = [];
  const random = randomSequence(417);
  const sandstone = ["#7e6250", "#8f7761", "#a18162", "#b09678", "#8e806e", "#705a4b", "#a2907a"].map(c => new T.Color(c));
  function quad(a: Point, b: Point, c: Point, d: Point, shade: T.Color, scale: number) {
    for (const p of [a,b,d,b,c,d]) {
      vertices.push(...p);
      colors.push(shade.r*scale, shade.g*scale, shade.b*scale);
    }
  }
  function courses(x: number, z: number, width: number, base: number, cap: number, yaw = 0) {
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    const point = (depth: number, y: number, along: number): Point =>
      [x + cos * depth + sin * along, y, z - sin * depth + cos * along];
    for (let y = base; y < cap - .012;) {
      const next = Math.min(cap, y + .048 + random() * .061);
      const end = width / 2;
      for (let cursor = -end; cursor < end - .012;) {
        const right = Math.min(end, cursor + .14 + random()*.39);
        const left = cursor + .003, r = right - .003;
        const bottom = y + .003, top = next - .002;
        const ridge = T.MathUtils.lerp(bottom,top,.33 + .30*random());
        const front = -.007 - random() * .034, back = .036;
        const a = point(front + .014, bottom, left), b = point(front + .011, bottom, r);
        const c = point(front - .007, ridge, r), d = point(front, ridge - .003, left);
        const e = point(front + .008, top, r), f = point(front + .012, top - .002, left);
        const shade = sandstone[Math.floor(random()*sandstone.length)];
        quad(a,b,c,d,shade,.83);
        quad(d,c,e,f,shade,1.02);
        quad(f,e,point(back,top,r),point(back,top,left),shade,1.13);
        quad(a,f,point(back,top,left),point(back,bottom,left),shade,.86);
        quad(e,b,point(back,bottom,r),point(back,top,r),shade,.87);
        cursor = right;
      }
      y = next;
    }
  }
  for (const { z, width, pool } of fountains) {
    courses(face - .098, z, width, poolLevel - .035, panelTop - .019);
    const front = pool.minX + .051, back = pool.maxX - .038;
    courses(front, z, pool.maxZ - pool.minZ - .035, .081, rim - .023);
    for (const side of [-1, 1]) {
      courses((front + back) / 2, side < 0 ? pool.minZ + .055 : pool.maxZ - .055,
        back - front + .025, .081, rim - .023, side * Math.PI / 2);
    }
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute("position", new T.Float32BufferAttribute(vertices,3));
  geo.setAttribute("color", new T.Float32BufferAttribute(colors,3));
  geo.computeVertexNormals();
  const mesh = new T.Mesh(geo, new T.MeshStandardMaterial({vertexColors:true,roughness:.47,metalness:.10}));
  mesh.name = "Split sandstone courses";
  mesh.receiveShadow = true;
  group.add(mesh);
}

function frontFace(width: number, height: number, x: number, y: number, z: number) {
  return new T.PlaneGeometry(width,height).rotateY(-Math.PI/2).translate(x,y,z);
}

function addEntranceSign(group: T.Group, parts: Parts) {
  const { width, height, z } = entranceSign;
  const y = 1.59;
  parts.box("#424b3c", face - .065, y, z, .13, height + .08, width + .08);
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 564;
  const c = canvas.getContext("2d")!;
  c.fillStyle = "#476338";
  c.fillRect(0, 0, canvas.width, canvas.height);
  const random = randomSequence(915);
  const leaves = ["#536f3f", "#6d854b", "#5c783e", "#354e31", "#768a52", "#415b35"];
  for (let i = 0; i < 24000; i++) {
    const x = random() * 1024, y = random() * 564;
    c.fillStyle = leaves[Math.floor(random() * leaves.length)];
    c.fillRect(x, y, 1 + random() * 5, 2 + random() * 5);
  }
  // Two lines of raised white letters and a red heart on the planted sign in the reference.
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.shadowColor = "#253425";
  c.shadowBlur = 3;
  c.shadowOffsetY = 6;
  c.shadowOffsetX = 2;
  c.font = "bold 171px Arial, sans-serif";
  c.fillStyle = "#faf9ed";
  c.fillText("I", 233, 174);
  c.fillText("UNN", 659, 174);
  c.fillStyle = "#da3647";
  c.beginPath();
  c.moveTo(379, 239);
  c.bezierCurveTo(363, 222, 298, 176, 301, 135);
  c.bezierCurveTo(303, 88, 357, 81, 379, 120);
  c.bezierCurveTo(409, 80, 461, 94, 457, 139);
  c.bezierCurveTo(454, 178, 401, 222, 379, 239);
  c.fill();
  c.fillStyle = "#faf9ed";
  c.font = "bold 159px Arial, sans-serif";
  c.fillText("NAYA BAAZAR", 512, 391, 938);
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 8;
  const sign = new T.Mesh(frontFace(width,height,face - .133,y,z),
    new T.MeshStandardMaterial({ map: texture, roughness: .87 }));
  sign.name = "I ♥ UNN NAYA BAAZAR";
  sign.receiveShadow = true;
  group.add(sign);
}

export function addEntranceFountain(parent: T.Group) {
  const group = new T.Group();
  group.name = "Market entrance fountain wall";
  parent.add(group);
  cladWall(group);
  ledgestone(group);
  const parts = new Parts(), light: T.BufferGeometry[] = [], water: FountainBay[] = [];
  addEntranceSign(group, parts);
  function downlight(x: number, y: number, z: number, width: number, height: number) {
    const wash = frontFace(width, height, x, y - height / 2, z);
    const uv = wash.getAttribute("uv");
    for (let j = 0; j < uv.count; j++) uv.setY(j, .5 * uv.getY(j));
    light.push(wash);
  }
  for (const { z, width, staggered, pool } of fountains) {
    const length=pool.maxZ-pool.minZ, basinDepth=pool.maxX-pool.minX;
    const midX=(pool.minX+pool.maxX)/2;
    const stone = "#8b7762", coping = "#c9b597";
    // Recess the core so the split faces stay exposed.
    const linerInset = .064;
    // A recessed bed and capped rims leave a real opening at the top of each basin.
    parts.box("#343936",face + .005,(panelTop+poolLevel)/2,z,.118,panelTop-poolLevel,width+.016);
    parts.box("#b19b80", face - .065, panelTop + .020, z, .215, .052, width + .08);
    parts.box(stone,midX,.169,z,basinDepth-2*linerInset,.25,length-2*linerInset);
    const wallHeight = rim - .019 - .19;
    for (const x of [pool.minX+.052,pool.maxX-.052]) {
      const linerX = x + Math.sign(midX-x)*linerInset/2;
      parts.box(stone,linerX,.19+wallHeight/2,z,.104-linerInset,wallHeight,length-2*linerInset);
      parts.box(coping,x,rim,z,.118,.038,length);
    }
    for (const side of [-1,1]) {
      const endZ=z+side*(length-.10)/2;
      parts.box(stone,midX,.19+wallHeight/2,endZ-side*linerInset/2,basinDepth-.20,wallHeight,.105-linerInset);
      parts.box(coping,midX,rim,endZ,basinDepth-.20,.038,.117);
    }
    function spout(offset: number, y: number, span: number, reach: number): Spillway {
      const outlet = { x: face - .273, y, z: z + offset * width, width: span * width, reach };
      const housing = face - .178;
      parts.box("#493d32", housing, y + .003, outlet.z, .17, .12, outlet.width + .093);
      parts.box("#9c8161", housing - .017, y + .054, outlet.z, .19, .034, outlet.width + .13);
      parts.box("#302f2a", outlet.x + .021, y + .016, outlet.z, .044, .020, outlet.width + .023);
      return outlet;
    }
    const lipHeight = 2.11, reach = .46;
    const sideHeight = staggered ? 1.61 : lipHeight;
    const sideReach = staggered ? .37 : reach;
    const centre = spout(0, lipHeight, staggered ? .272 : .24, reach);
    downlight(face - .149, lipHeight - .025, centre.z, centre.width * 1.16, .79);
    water.push({
      z, level: poolLevel, width: length - .206, front: pool.minX + .105, back: face - .143,
      spillways: [spout(-.312, sideHeight, .24, sideReach), centre, spout(.312, sideHeight, .24, sideReach)],
    });
  }
  for (const z of fountainGaps) {
    const y=1.40;
    parts.box("#806647",face - .029,y,z,.067,.175,.136);
    parts.box("#574d3e",face - .077,y,z,.077,.127,.097);
    for (const sign of [-1,1]) parts.box("#f3cb83",face - .077,y+sign*.072,z,.057,.010,.079);
    light.push(frontFace(.56,.92,wall.minX-.002,y,z));
  }
  parts.build(group);

  const glow = new T.ShaderMaterial({
    vertexShader:`varying vec2 coord; void main(){
      coord = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
    fragmentShader:`varying vec2 coord; void main(){
      vec2 p=coord*2.-1.;
      float along=abs(p.y);
      float radius=.072+.64*along;
      float wash=(1.-smoothstep(.3*radius,radius,abs(p.x)))*(1.-smoothstep(.05,1.,along));
      gl_FragColor=vec4(1.,.64,.24,.30*wash);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
    depthWrite:false,transparent:true,blending:T.AdditiveBlending,
  });
  const washes = new T.Mesh(mergeGeometries(light)!, glow);
  washes.name = "Warm wall sconce washes";
  washes.renderOrder = 4;
  group.add(washes);
  light.forEach(geometry => geometry.dispose());
  return addFountainWater(group, water);
}
