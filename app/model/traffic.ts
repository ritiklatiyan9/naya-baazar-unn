import * as T from "three";
import { sheetPoint, type Unit } from "./geometry";
import { stockDeliveries } from "./stockDelivery";
import { riddenBike } from "./motorbikes";
import { car } from "./cars";
import { contactTexture } from "./shoppers";
import { marketRoadCenter } from "./carriageway";

import { assemble, box } from "./vehicleGeometry";

export function trafficLane() {
  const center = marketRoadCenter();
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
  const deliveries=stockDeliveries(parent,groundUnits,shadowMaterial,trafficPeriod);
  const vehicles=[
    // Common Indian showroom colours: fire-red and silver hatchbacks, a pearl-white SUV.
    {drive:driveCycle(lane,first,-5,15,2.11),place:car(parent,"#8e1c1e",false,shadowMaterial)},
    {drive:driveCycle(lane,second,9,20,2.17),place:car(parent,"#e8e8e3",true,shadowMaterial)},
    {drive:driveCycle(lane,.16,0),place:car(parent,"#8b8f92",false,shadowMaterial)},
    {drive:driveCycle(lane,.05,0),place:riddenBike(parent,false,shadowMaterial)},
    {drive:driveCycle(lane,.93,0),place:riddenBike(parent,true,shadowMaterial)},
  ];
  const state:VehicleState={position:new T.Vector3(),heading:0,travel:0,bank:0};
  vehicles[0].drive(5,state); parkingCorners(parent,state);
  vehicles[1].drive(0,state); parkingCorners(parent,state);
  return {
    serviceShopIds:deliveries.map(delivery=>delivery.id),
    workerPoses:deliveries.map(delivery=>delivery.pose),
    update(time:number,openDoors:Set<number>,deliveryTime?:number) {
      // A gap between the through vehicles lets the camera see both tailgates.
      const trafficTime=deliveryTime===undefined ? time : time+98;
      for(const vehicle of vehicles){
        vehicle.drive(trafficTime,state);
        vehicle.place(state.position,state.heading,state.travel,state.bank);
      }
      for(const delivery of deliveries) delivery.update(time,openDoors,deliveryTime);
    }
  };
}
