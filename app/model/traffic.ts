import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { sheetPoint, type Unit } from "./geometry";
import { stockDelivery } from "./stockDelivery";
import { riddenBike } from "./marketVehicles";
import { contactTexture } from "./shoppers";

import { assemble, box, part, roadShadow } from "./vehicleGeometry";

const up = new T.Vector3(0, 1, 0);
export function trafficLane() {
  // Centreline surveyed from the two pavement edges; end turns stay within the mouths of the drive.
  const axis = [[337, 773], [344, 731], [355, 693], [374, 651], [403, 617], [446, 592],
  [493, 578], [544, 574], [602, 583], [666, 585], [722, 575], [773, 551],
  [804, 517], [822, 474], [830, 420], [830, 359], [829, 300], [829, 240], [832, 187]];
  const center = new T.CatmullRomCurve3(axis.map(([x, y]) => {
    const p = sheetPoint(x, y); return new T.Vector3(p.x, 0, p.y);
  }));
  const points: T.Vector3[] = [];
  const n = 60, radius = 3.20;
  // A wider turning circle at each entrance leaves the kerbs clear along the two-way street.
  const laneOffset = (u: number) => T.MathUtils.lerp(radius, 1.76,
    T.MathUtils.smoothstep(Math.min(u,1-u),0,.105));
  function axes(u: number) {
    const p = center.getPointAt(u), tangent = center.getTangentAt(u);
    return { p, tangent, side: new T.Vector3(tangent.z, 0, -tangent.x) };
  }
  for (let i = 0; i <= n; i++) {
    const { p, side } = axes(i / n);
    points.push(p.addScaledVector(side, laneOffset(i/n)));
  }
  for (let i = 1; i < 12; i++) {
    const { p, side, tangent } = axes(1), theta = i * Math.PI / 12;
    points.push(p.addScaledVector(side, radius * Math.cos(theta)).addScaledVector(tangent, radius * Math.sin(theta)));
  }
  for (let i = n; i >= 0; i--) {
    const { p, side } = axes(i / n); points.push(p.addScaledVector(side, -laneOffset(i/n)));
  }
  for (let i = 1; i < 12; i++) {
    const { p, side, tangent } = axes(0), theta = i * Math.PI / 12;
    points.push(p.addScaledVector(side, -radius * Math.cos(theta)).addScaledVector(tangent, -radius * Math.sin(theta)));
  }
  const lane = new T.CatmullRomCurve3(points, true, "centripetal");
  lane.arcLengthDivisions = 640;
  return lane;
}

type Section = [z: number, halfWidth: number, top: number];
/** Transverse coachwork sections, with radiused shoulders and a raised sill. */
function coachwork(sections: Section[], bottom: number) {
  const rings = sections.map(([z, w, h]) => [
    [-w * .88, bottom, z], [-w, bottom + .14, z], [-w * .98, h - .12, z], [-w * .81, h - .015, z],
    [-w * .45, h + .022, z], [w * .45, h + .022, z], [w * .81, h - .015, z], [w * .98, h - .12, z],
    [w, bottom + .14, z], [w * .88, bottom, z],
  ]);
  const positions: number[] = [];
  function triangle(a: number[], b: number[], c: number[]) { positions.push(...a, ...b, ...c); }
  for (let i = 1; i < rings.length; i++) {
    const from = rings[i - 1], to = rings[i];
    for (let j = 0; j < to.length; j++) {
      const n = (j + 1) % to.length;
      triangle(from[j], to[j], to[n]); triangle(from[j], to[n], from[n]);
    }
  }
  for (let j = 1; j < 9; j++) {
    triangle(rings[0][0], rings[0][j], rings[0][j + 1]);
    const last = rings[rings.length - 1]; triangle(last[0], last[j + 1], last[j]);
  }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  g.computeVertexNormals();
  return g;
}

function car(parent: T.Group, paint: string, suv: boolean, shadowMaterial: T.Material) {
  const group = new T.Group(); group.name = suv ? "Moving crossover" : "Moving saloon";
  parent.add(group);
  const details: T.BufferGeometry[] = [];
  const shell: T.BufferGeometry[] = [];
  const glass: T.BufferGeometry[] = [];
  const scale = suv ? 1.04 : 1, height = suv ? 1.63 : 1.45;
  const temp = new T.Object3D();
  function panel(bucket: T.BufferGeometry[], verts: number[][], color: string) {
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute([0, 1, 2, 0, 2, 3].flatMap(i => verts[i]), 3)); g.computeVertexNormals();
    part(bucket, g, color);
  }
  function strut(color: string, a: T.Vector3, b: T.Vector3, width: number, depth: number) {
    const d = b.clone().sub(a), middle = a.clone().lerp(b, .5);
    const g = new T.BoxGeometry(width, d.length(), depth);
    g.applyQuaternion(new T.Quaternion().setFromUnitVectors(up, d.normalize()));
    part(shell, g, color, middle.x, middle.y, middle.z);
  }
  part(shell, coachwork([[-2.10, .72, .79], [-1.94, .86, .89], [-1.32, .89, .94], [-.55, .9, .94],
  [.65, .89, .91], [1.58, .86, .83], [2.03, .75, .75]], .37), paint);
  const roofRear = suv ? -1.31 : -.91, rear = suv ? -1.75 : -1.62, front = 1.01, roofFront = .35;
  const w = .817, top = .664, low = .90;
  panel(glass, [[-w, low, front], [w, low, front], [top, height, roofFront], [-top, height, roofFront]], "#8faab4");
  panel(glass, [[w, low, rear], [-w, low, rear], [-top, height, roofRear], [top, height, roofRear]], "#738e9a");
  panel(shell, [[-top, height + .012, roofRear], [-top, height + .012, roofFront], [top, height + .012, roofFront], [top, height + .012, roofRear]], paint);
  for (const sign of [-1, 1]) {
    const sideWin = [[w * sign, low, rear], [w * sign, low, front], [top * sign, height, roofFront], [top * sign, height, roofRear]];
    panel(glass, sideWin, "#829ca7");
    const v = (p: number[]) => new T.Vector3(...p as [number, number, number]);
    strut(paint, v(sideWin[1]), v(sideWin[2]), .055, .068);
    strut(paint, v(sideWin[0]), v(sideWin[3]), .062, .105);
    strut("#292e30", new T.Vector3(sign * w, low, -.28), new T.Vector3(sign * top, height, -.33), .055, .085);
    box(shell, "#a4abb0", sign * w, .895, -.22, .034, .025, 2.28);
    box(details, "#363b3b", sign * .895, .525, -.10, .035, .06, 3.30);
    box(details, "#c6c8c5", sign * .895, .825, .13, .025, .025, .16);
    box(details, "#c6c8c5", sign * .895, .825, -.96, .025, .025, .16);
    part(shell, new T.SphereGeometry(.5, 10, 6), paint, sign * .92, .965, .62, .218, .15, .225);
    box(details, "#eae8db", sign * .58, .742, 1.99, .33, .11, .038, 0, -sign * .12, 0);
    box(details, "#a44841", sign * .60, .757, -2.076, .27, .105, .035);
    for (const z of [-.93, .39]) {
      box(details, "#545358", sign * .37, .86, z, .49, .51, .19, -.18);
      box(details, "#555258", sign * .37, 1.08, z - .06, .205, .177, .13, -.10);
    }
  }
  // Driver behind the windscreen; the cabin is fully enclosed by transparent panes.
  part(details, new T.SphereGeometry(.5, 10, 6), "#b4896b", .35, 1.16, .44, .18, .21, .19);
  part(details, new T.SphereGeometry(.5, 10, 6), "#443a37", .35, 1.23, .434, .178, .095, .18);
  box(details, "#4a6063", .35, .962, .43, .31, .35, .18);
  box(details, "#302f30", 0, .55, 2.014, .79, .12, .041);
  box(details, "#d4d2bf", 0, .583, 2.039, .33, .075, .015);
  box(details, "#302f30", 0, .48, -2.087, 1.11, .08, .04);
  assemble(group, details, { roughness: .56 });
  assemble(group, shell, { roughness: .33, metalness: .22 });
  assemble(group, glass, { roughness: .21, metalness: .10, transparent: true, opacity: .67, depthWrite: false });
  const tireParts: T.BufferGeometry[] = [];
  const cylinder = (r: number, h: number) => new T.CylinderGeometry(r, r, h, 18).rotateZ(Math.PI / 2);
  part(tireParts, cylinder(.324, .17), "#292a29");
  for (const side of [-1, 1]) {
    part(tireParts, cylinder(.222, .011), "#a9a9a3", side * .09);
    part(tireParts, cylinder(.172, .013), "#3e4140", side * .099);
    for (let i = 0; i < 5; i++) {
      const a = i * Math.PI * 2 / 5;
      box(tireParts, "#b5b7b2", side * .111, .072 * Math.cos(a), .072 * Math.sin(a), .015, .16, .036, a);
    }
    part(tireParts, cylinder(.052, .013), "#b0b2b1", side * .122);
  }
  const wheels = new T.InstancedMesh(mergeGeometries(tireParts)!, new T.MeshStandardMaterial({ vertexColors: true, roughness: .72 }), 4);
  tireParts.forEach(g => g.dispose()); group.add(wheels);
  wheels.instanceMatrix.setUsage(T.DynamicDrawUsage);
  wheels.frustumCulled = false;
  group.scale.setScalar(scale);
  roadShadow(group, shadowMaterial, 2.28, 4.6);
  function update(point: T.Vector3, heading: number, distance: number) {
    group.position.set(point.x, .032, point.z); group.rotation.y = heading;
    const rotation = (distance / (.324 * scale)) % (2 * Math.PI);
    let i = 0;
    for (const side of [-1, 1]) for (const z of [-1.27, 1.28]) {
      temp.position.set(side * .84, .324, z); temp.rotation.set(rotation, 0, 0); temp.scale.set(1, 1, 1);
      temp.updateMatrix(); wheels.setMatrixAt(i++, temp.matrix);
    }
    wheels.instanceMatrix.needsUpdate = true;
  }
  return update;
}

const trafficPeriod=121;
type VehicleState={position:T.Vector3; heading:number; travel:number; bank:number};

function driveCycle(lane:T.CatmullRomCurve3, start:number, delay:number, hold=0, bayOffset=0) {
  const length=lane.getLength();
  const movingTime=trafficPeriod-hold, ramp=hold?2.3:0, speed=length/(movingTime-ramp);
  const direction = new T.Vector3(), ahead=new T.Vector3(), behind=new T.Vector3(), center=new T.Vector3();
  function position(distance:number, out:T.Vector3) {
    const d=T.MathUtils.euclideanModulo(distance,length);
    const u=T.MathUtils.euclideanModulo(start+d/length,1);
    lane.getPointAt(u,out);
    if(bayOffset){
      const distanceToBay=Math.min(d,length-d);
      if(distanceToBay<14){
        lane.getTangentAt(u,direction);
        const shift=bayOffset*(1-T.MathUtils.smootherstep(distanceToBay,0,14));
        out.x+=direction.z*shift; out.z-=direction.x*shift;
      }
    }
    return out;
  }
  return (time:number,state:VehicleState) => {
    const clock=T.MathUtils.euclideanModulo(time+delay,trafficPeriod);
    const t=Math.max(0,clock-hold);
    const d=t<ramp ? .5*speed*t*t/ramp : t>movingTime-ramp ?
      length-.5*speed*(movingTime-t)**2/ramp : speed*(t-ramp*.5);
    position(d,state.position); position(d+.36,ahead); position(d-.36,behind);
    state.heading=Math.atan2(ahead.x-behind.x,ahead.z-behind.z);
    // Gentle counter-lean around the street bends, capped for the slow market traffic.
    center.copy(ahead).sub(state.position);
    behind.subVectors(state.position,behind);
    const curvature=Math.atan2(center.x*behind.z-center.z*behind.x,center.dot(behind))/.36;
    state.bank=T.MathUtils.clamp(-curvature*speed*speed/9.81,-.12,.12);
    state.travel=d+Math.floor((time+delay)/trafficPeriod)*length;
  };
}

function station(lane:T.CatmullRomCurve3,x:number,z:number) {
  const target=sheetPoint(x,z), p=new T.Vector3();
  let u=0,closest=Infinity;
  for(let i=0;i<1500;i++){
    lane.getPointAt(i/1500,p);
    const d=(p.x-target.x)**2+(p.z-target.y)**2;
    if(d<closest){closest=d;u=i/1500;}
  }
  return u;
}
function parkingCorners(parent:T.Group,pose:VehicleState) {
  const pieces:T.BufferGeometry[]=[];
  for(const x of [-1.02,1.02]) for(const z of [-2.78,2.78]) {
    box(pieces,"#c9c4a9",x-.16*Math.sign(x),0,z,.37,.008,.056);
    box(pieces,"#c9c4a9",x,0,z-.27*Math.sign(z),.056,.008,.59);
  }
  const corners=new T.Group();
  corners.name="Kerbside parking bay"; corners.position.copy(pose.position); corners.position.y=.046;
  corners.rotation.y=pose.heading; assemble(corners,pieces,{roughness:.99}); parent.add(corners);
}
export function createTraffic(parent: T.Group,groundUnits:Unit[]) {
  const lane=trafficLane(), first=station(lane,793,286), second=station(lane,579,620);
  const shadowMaterial=new T.MeshBasicMaterial({map:contactTexture(),transparent:true,depthWrite:false});
  const delivery=stockDelivery(parent,groundUnits,shadowMaterial,trafficPeriod);
  const vehicles=[
    {drive:driveCycle(lane,first,-5,15,2.11),place:car(parent,"#a15e4d",false,shadowMaterial)},
    {drive:driveCycle(lane,second,9,20,2.17),place:car(parent,"#d3c9ae",true,shadowMaterial)},
    {drive:driveCycle(lane,.16,0),place:car(parent,"#547674",false,shadowMaterial)},
    {drive:driveCycle(lane,.05,0),place:riddenBike(parent,false,shadowMaterial)},
    {drive:driveCycle(lane,.93,0),place:riddenBike(parent,true,shadowMaterial)},
  ];
  const state:VehicleState={position:new T.Vector3(),heading:0,travel:0,bank:0};
  vehicles[0].drive(5,state); parkingCorners(parent,state);
  vehicles[1].drive(0,state); parkingCorners(parent,state);
  return {
    serviceShopId:delivery?.id, workerPose:delivery?.pose,
    update(time:number,openDoors:Set<number>) {
      for(const vehicle of vehicles){
        vehicle.drive(time,state);
        vehicle.place(state.position,state.heading,state.travel,state.bank);
      }
      delivery?.update(time,openDoors);
    }
  };
}
