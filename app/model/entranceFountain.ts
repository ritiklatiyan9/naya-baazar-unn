import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { Parts } from "./geometry";

const wall = { minX: 8.92, maxX: 9.23, minZ: .18, maxZ: 21.45 };
const wallTop = 2.78;
const panelTop = 2.57, poolLevel = .374;
const panels = [
  { z: 4.79, width: 2.72 }, { z: 10.01, width: 2.84 },
  { z: 15.26, width: 2.84 }, { z: 20.01, width: 2.48 },
];
const pools = panels.map(({ z, width }) => ({
  minX: 7.57, maxX: 8.99, minZ: z - width / 2 - .10, maxZ: z + width / 2 + .10,
}));
export const entranceFountainFootprints = [wall, ...pools];

function randomSequence(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

/** Warm, horizontally bedded stone. The repeat is seamless in both directions. */
function sandstone() {
  const w = 512, h = 256, tau = Math.PI * 2;
  const pixels = new Uint8Array(w * h * 4);
  const random = randomSequence(832);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = tau * x / w, v = tau * y / h;
    const bedding = v * 7 + 1.18 * Math.sin(u + .35 * Math.sin(v)) + .32 * Math.sin(3*u - v);
    const band = Math.sin(bedding);
    const vein = Math.pow(.5 + .5 * Math.sin(bedding * 2 + .73 * Math.sin(u - v)), 12);
    const grain = (random() - .5) * 7 + 2 * Math.sin(17*v + 3*Math.sin(2*u));
    const i = (y * w + x) * 4;
    pixels[i] = 218 + 6*band - 11*vein + grain;
    pixels[i+1] = 192 + 9*band - 19*vein + grain;
    pixels[i+2] = 156 + 10*band - 21*vein + grain;
    pixels[i+3] = 255;
  }
  const map = new T.DataTexture(pixels, w, h);
  map.colorSpace = T.SRGBColorSpace;
  map.wrapS = map.wrapT = T.RepeatWrapping;
  map.minFilter = T.LinearMipmapLinearFilter;
  map.magFilter = T.LinearFilter;
  map.generateMipmaps = true;
  map.anisotropy = 4;
  map.needsUpdate = true;
  return map;
}

function cladWall(group: T.Group) {
  const length = wall.maxZ - wall.minZ;
  const geom = new T.BoxGeometry(wall.maxX - wall.minX, wallTop - .055, length);
  const position = geom.getAttribute("position"), normal = geom.getAttribute("normal"), uv = geom.getAttribute("uv");
  for (let i = 0; i < position.count; i++) {
    const u = Math.abs(normal.getZ(i)) > .5 ? position.getX(i) : position.getZ(i);
    const v = Math.abs(normal.getY(i)) > .5 ? position.getX(i) : position.getY(i);
    uv.setXY(i, u / 4.6, v / 1.07);
  }
  const block = new T.Mesh(geom, new T.MeshStandardMaterial({ map: sandstone(), roughness: .8 }));
  block.name = "Veined sandstone boundary wall";
  block.position.set((wall.minX + wall.maxX)/2, (wallTop + .055)/2, (wall.minZ + wall.maxZ)/2);
  block.castShadow = block.receiveShadow = true;
  group.add(block);
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
        const front = 8.827 - random()*.043, back = 8.912;
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

function pooledPlanes(group: T.Group, pieces: T.BufferGeometry[], material:T.Material, name:string) {
  const mesh = new T.Mesh(mergeGeometries(pieces)!,material);
  mesh.name = name;
  group.add(mesh);
  pieces.forEach(geo=>geo.dispose());
  return mesh;
}

export function addEntranceFountain(parent: T.Group) {
  const group = new T.Group();
  group.name = "Sandstone and slate fountain wall";
  parent.add(group);
  cladWall(group);
  ledgestone(group);
  const parts = new Parts(), falls:T.BufferGeometry[]=[], water:T.BufferGeometry[]=[], light:T.BufferGeometry[]=[];
  const wallLength = wall.maxZ-wall.minZ, centerZ = (wall.minZ+wall.maxZ)/2;
  parts.box("#c2a987",9.072,wallTop+.024,centerZ,.39,.048,wallLength+.07);
  parts.box("#a28466",9.066,.13,centerZ,.334,.17,wallLength+.014);
  for (const [i, { z, width }] of panels.entries()) {
    const pool=pools[i], length=pool.maxZ-pool.minZ, basinDepth=pool.maxX-pool.minX;
    const midX=(pool.minX+pool.maxX)/2;
    // A recessed bed and capped rims leave a real opening at the top of each basin.
    parts.box("#343936",8.925,(panelTop+poolLevel)/2,z,.118,panelTop-poolLevel,width+.016);
    parts.box("#5e5a4f",8.855,panelTop+.020,z,.215,.052,width+.08);
    parts.box("#282f30",8.796,panelTop-.040,z,.070,.049,width-.085);
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
    const innerDepth=8.77-(pool.minX+.099);
    water.push(new T.PlaneGeometry(length-.197,innerDepth)
      .rotateY(-Math.PI/2).rotateZ(-Math.PI/2)
      .translate(8.77-innerDepth/2,poolLevel,z));
    const fallHeight=panelTop-.07-poolLevel;
    falls.push(frontFace(width-.07,fallHeight,8.769,poolLevel+fallHeight/2,z));
    for (const offset of [-.32,0,.32]) {
      const lampZ=z+offset*width;
      parts.box("#967853",8.755,panelTop-.049,lampZ,.044,.027,.110);
      parts.box("#f9dda3",8.739,panelTop-.060,lampZ,.043,.010,.076);
      const downward=frontFace(.34,.44,8.766,panelTop-.269,lampZ);
      // Use the lower half of the wash for downlights beneath the slate cap.
      const uv=downward.getAttribute("uv");
      for(let j=0;j<uv.count;j++)uv.setY(j,.5*uv.getY(j));
      light.push(downward);
    }
  }
  for (const z of [2.22,7.42,12.68,17.76]) {
    const y=1.40;
    parts.box("#806647",8.891,y,z,.067,.175,.136);
    parts.box("#574d3e",8.843,y,z,.077,.127,.097);
    for (const sign of [-1,1]) parts.box("#f3cb83",8.843,y+sign*.072,z,.057,.010,.079);
    light.push(frontFace(.56,.92,wall.minX-.002,y,z));
  }
  parts.build(group);

  const time={ value:0 };
  pooledPlanes(group,water,waterMaterial(time,false),"Water and submerged mosaic in the four basins");
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
