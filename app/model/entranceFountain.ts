import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { Parts, prism } from "./geometry";
import { eastFacadeAt, entranceSign, fountainGaps, fountainPanels as panels, fountainWallEnd, fountainWallFace as face } from "./entranceLayout";
import { facadeFinish } from "./siteMaterials";

const wallBack = face + .31;
const wall = { minX: face, maxX: wallBack, minZ: eastFacadeAt(wallBack) - .015, maxZ: fountainWallEnd };
const wallTop = 2.78;
const panelTop = 2.57, poolLevel = .374;
const pools = panels.map(({ z, width }) => ({
  minX: face - 1.15, maxX: face + .04, minZ: z - width / 2 - .08, maxZ: z + width / 2 + .08,
}));
export const entranceFountainFootprints = [wall, ...pools];

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
  const shades = ["#4c4b47","#54534c","#5f5d54","#45494a","#646057","#514f49","#696458"].map(c => new T.Color(c));
  function quad(a: Point, b: Point, c: Point, d: Point, shade: T.Color, scale: number) {
    for (const p of [a,b,d,b,c,d]) {
      vertices.push(...p);
      colors.push(shade.r*scale, shade.g*scale, shade.b*scale);
    }
  }
  for (const { z, width } of panels) {
    for (let y = poolLevel - .035; y < panelTop - .028;) {
      const next = Math.min(panelTop - .019, y + .048 + random()*.061);
      const end = z + width/2;
      for (let cursor = z - width/2; cursor < end - .012;) {
        const right = Math.min(end, cursor + .14 + random()*.39);
        const left = cursor + .003, r = right - .003;
        const bottom = y + .003, top = next - .002;
        const ridge = T.MathUtils.lerp(bottom,top,.33 + .30*random());
        const front = face - .093 - random()*.043, back = face - .008;
        const a: Point = [front+.014,bottom,left], b: Point = [front+.011,bottom,r];
        const c: Point = [front-.007,ridge,r], d: Point = [front,ridge-.003,left];
        const e: Point = [front+.008,top,r], f: Point = [front+.012,top-.002,left];
        const shade = shades[Math.floor(random()*shades.length)];
        quad(a,b,c,d,shade,.83);
        quad(d,c,e,f,shade,1.02);
        quad(f,e,[back,top,r],[back,top,left],shade,1.13);
        quad(a,f,[back,top,left],[back,bottom,left],shade,.86);
        quad(e,b,[back,bottom,r],[back,top,r],shade,.87);
        cursor = right;
      }
      y = next;
    }
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute("position", new T.Float32BufferAttribute(vertices,3));
  geo.setAttribute("color", new T.Float32BufferAttribute(colors,3));
  geo.computeVertexNormals();
  const mesh = new T.Mesh(geo, new T.MeshStandardMaterial({vertexColors:true,roughness:.47,metalness:.10}));
  mesh.name = "Split charcoal slate ledges";
  mesh.receiveShadow = true;
  group.add(mesh);
}

const waterVertex = `
  varying vec2 coord;
  varying float alongWall;
  varying vec3 toEye;
  varying vec3 faceNormal;
  void main(){
    coord=uv;
    alongWall=position.z;
    vec4 eye=modelViewMatrix*vec4(position,1.);
    toEye=-eye.xyz;
    faceNormal=normalMatrix*normal;
    gl_Position=projectionMatrix*eye;
  }`;
const finishColor = `
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

function waterMaterial(time: {value:number}, falling: boolean) {
  const fragment = falling ? `
    float u=coord.x, v=coord.y;
    float flow=u*138.+.59*sin(26.*v+t*3.1+u*24.+alongWall)+.25*sin(v*60.+4.*t);
    float threads=pow(.5+.5*cos(flow),9.);
    float runnel=pow(.5+.5*cos(u*41.+.94*sin(u*14.+alongWall*.6)+.23*sin(v*13.+t*1.8+u*18.)),6.);
    float scud=.20+.80*pow(.5+.5*sin(v*32.+t*5.2+3.*sin(u*18.+alongWall*.73)),2.);
    float breadth=smoothstep(.0,.05,u)*smoothstep(.0,.05,1.-u);
    float film=.06+.07*pow(.5+.5*cos(u*23.+.45*sin(v*11.+t*2.)),2.);
    float detail=1.-smoothstep(.8,3.,fwidth(flow));
    float opacity=breadth*(film+(.26*runnel+.46*threads*detail)*scud);
    gl_FragColor=vec4(vec3(.48,.62,.65),opacity);
  ` : `
    float u=coord.x, back=coord.y;
    float grazing=pow(1.-abs(dot(normalize(toEye),normalize(faceNormal))),2.);
    float swell=sin(17.*u+5.*back-t*1.6)+.38*sin(42.*u-9.*back+2.1*t);
    float fan=length(vec2(fract(u*3.+.3+.08*sin(alongWall))-.5,(1.-back)*1.36));
    float ripples=pow(.5+.5*cos(48.*fan-3.8*t+1.25*swell),7.);
    float impact=exp(-7.*(1.-back));
    float crest=(.05+.30*impact)*ripples;
    vec2 cell=fract(vec2(u*32., back*12.));
    float grout=step(.055,min(cell.x,cell.y));
    vec3 deep=mix(vec3(.022,.050,.061),vec3(.033,.101,.113),grout);
    vec3 water=mix(deep,vec3(.23,.32,.34),.18+.51*grazing+.04*swell);
    water+=crest*vec3(.37,.46,.45)+.15*impact*vec3(.36,.39,.36);
    gl_FragColor=vec4(water,1.);
  `;
  return new T.ShaderMaterial({
    vertexShader:waterVertex, uniforms:{t:time},
    transparent:falling, depthWrite:!falling,
    fragmentShader:"uniform float t; varying vec2 coord; varying float alongWall; varying vec3 toEye; varying vec3 faceNormal; void main(){\n"+fragment+finishColor,
  });
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

function pooledPlanes(group: T.Group, pieces: T.BufferGeometry[], material:T.Material, name:string) {
  const mesh = new T.Mesh(mergeGeometries(pieces)!,material);
  mesh.name = name;
  group.add(mesh);
  pieces.forEach(geo=>geo.dispose());
  return mesh;
}

export function addEntranceFountain(parent: T.Group) {
  const group = new T.Group();
  group.name = "Market entrance fountain wall";
  parent.add(group);
  cladWall(group);
  ledgestone(group);
  const parts = new Parts(), falls:T.BufferGeometry[]=[], water:T.BufferGeometry[]=[], light:T.BufferGeometry[]=[];
  addEntranceSign(group, parts);
  for (const [i, { z, width }] of panels.entries()) {
    const pool=pools[i], length=pool.maxZ-pool.minZ, basinDepth=pool.maxX-pool.minX;
    const midX=(pool.minX+pool.maxX)/2;
    // A recessed bed and capped rims leave a real opening at the top of each basin.
    parts.box("#343936",face + .005,(panelTop+poolLevel)/2,z,.118,panelTop-poolLevel,width+.016);
    parts.box("#5e5a4f",face - .065,panelTop+.020,z,.215,.052,width+.08);
    parts.box("#282f30",face - .124,panelTop-.040,z,.070,.049,width-.085);
    parts.box("#232c2e",midX,.169,z,basinDepth,.25,length);
    const coping="#505351", black="#272e30";
    for (const x of [pool.minX+.052,pool.maxX-.052]) {
      parts.box(black,x,.304,z,.104,.205,length);
      parts.box(coping,x,.423,z,.118,.038,length);
    }
    for (const side of [-1,1]) {
      const endZ=z+side*(length-.10)/2;
      parts.box(black,midX,.307,endZ,basinDepth-.20,.208,.105);
      parts.box(coping,midX,.423,endZ,basinDepth-.20,.038,.117);
    }
    for(let j=1;j<4;j++) {
      parts.box("#404644",pool.minX-.001,.214,pool.minZ+j*length/4,.004,.329,.004);
    }
    const innerDepth=face - .15-(pool.minX+.099);
    water.push(new T.PlaneGeometry(length-.197,innerDepth)
      .rotateY(-Math.PI/2).rotateZ(-Math.PI/2)
      .translate(face - .15-innerDepth/2,poolLevel,z));
    const fallHeight=panelTop-.07-poolLevel;
    falls.push(frontFace(width-.07,fallHeight,face - .151,poolLevel+fallHeight/2,z));
    for (const offset of [-.32,0,.32]) {
      const lampZ=z+offset*width;
      parts.box("#967853",face - .165,panelTop-.049,lampZ,.044,.027,.110);
      parts.box("#f9dda3",face - .181,panelTop-.060,lampZ,.043,.010,.076);
      const downward=frontFace(.34,.44,face - .154,panelTop-.269,lampZ);
      // Use the lower half of the wash for downlights beneath the slate cap.
      const uv=downward.getAttribute("uv");
      for(let j=0;j<uv.count;j++)uv.setY(j,.5*uv.getY(j));
      light.push(downward);
    }
  }
  for (const z of fountainGaps) {
    const y=1.40;
    parts.box("#806647",face - .029,y,z,.067,.175,.136);
    parts.box("#574d3e",face - .077,y,z,.077,.127,.097);
    for (const sign of [-1,1]) parts.box("#f3cb83",face - .077,y+sign*.072,z,.057,.010,.079);
    light.push(frontFace(.56,.92,wall.minX-.002,y,z));
  }
  parts.build(group);

  const time={ value:0 };
  pooledPlanes(group,water,waterMaterial(time,false),"Water and submerged mosaic in the six basins");
  pooledPlanes(group,falls,waterMaterial(time,true),"Flow over the slate panels").renderOrder = 2;
  const glow = new T.ShaderMaterial({
    vertexShader:waterVertex,
    fragmentShader:`varying vec2 coord; void main(){
      vec2 p=coord*2.-1.;
      float along=abs(p.y);
      float radius=.072+.64*along;
      float wash=(1.-smoothstep(.3*radius,radius,abs(p.x)))*(1.-smoothstep(.05,1.,along));
      gl_FragColor=vec4(1.,.64,.24,.30*wash);
    `+finishColor,
    depthWrite:false,transparent:true,blending:T.AdditiveBlending,
  });
  pooledPlanes(group,light,glow,"Warm wall sconce washes").renderOrder=3;
  return (seconds:number)=>{time.value=seconds;};
}
