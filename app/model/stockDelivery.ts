import * as T from "three";
import { sheetPoint, type Unit } from "./geometry";
import { retailBays, glassSetback, shopEntrance, shopFloorHeight } from "./retailFrontages";
import { wingBoundaries } from "./wings";
import { deliveryPickup, stockCarton } from "./marketVehicles";
import { assemble, box } from "./vehicleGeometry";
import type { PersonPose } from "./shoppers";

const v3 = (p:T.Vector2, y:number) => new T.Vector3(p.x,y,p.y);
const ease = (t:number) => T.MathUtils.smootherstep(t,0,1);
const angle = (a:number,b:number,t:number) => a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*ease(t);

/** One load and its receiving shelf share the same four cartons throughout a visit. */
export function stockDelivery(parent:T.Group, units:Unit[], shadowMaterial:T.Material, trafficPeriod:number) {
  const near = sheetPoint(875,365);
  const bay = retailBays(wingBoundaries[0],units).filter(b => b.width>2.6)
    .sort((a,b)=>a.at(0,0).distanceToSquared(near)-b.at(0,0).distanceToSquared(near))[0];
  if (!bay || bay.at(0,0).distanceTo(near)>5) return;

  const serviceShopId=bay.id, jamb=shopEntrance(bay.width).center, glass=glassSetback.ground;
  const door=v3(bay.at(jamb,glass),shopFloorHeight.ground);
  const {group:pickup,gate,wheels}=deliveryPickup(parent,shadowMaterial);
  const berth=new T.Vector3(sheetPoint(864.45,365).x,.033,door.z+2.7);
  const tail=berth.clone().add(new T.Vector3(.03,0,-2.55));
  const destination=v3(bay.at(jamb,glass+1.23),shopFloorHeight.ground);
  const path=new T.CatmullRomCurve3([
    tail, tail.clone().add(new T.Vector3(.38,0,-.18)),
    v3(bay.at(jamb,-.22),.111), v3(bay.at(jamb,.28),shopFloorHeight.ground),
    door, destination,
  ]);
  const length=path.getLength(), walkTime=length/1.06+.55;
  const tangent=new T.Vector3(), point=new T.Vector3();
  const endTangent=path.getTangent(1), homeHeading=Math.atan2(endTangent.x,endTangent.z);
  const firstTangent=path.getTangent(0), depart=Math.atan2(firstTangent.x,firstTangent.z);

  // Rearward gravity rollers and side guides allow one carton at a time to reach the tailgate.
  const fittings:T.BufferGeometry[]=[];
  for(let i=0;i<13;i++) box(fittings,"#adb3a4",0,.736,-.04-i*.145,1.29,.043,.058);
  for(const side of [-1,1]) box(fittings,"#879085",side*.66,.774,-.94,.04,.075,1.94);
  assemble(pickup,fittings,{roughness:.65,metalness:.18});

  const template=stockCarton(), parcels:T.Group[]=[];
  const load:T.Vector3[]=[], shelf:T.Vector3[]=[];
  const cabinet=new T.Group();
  parent.add(cabinet); cabinet.position.copy(destination); cabinet.rotation.y=homeHeading;
  const shelves:T.BufferGeometry[]=[];
  box(shelves,"#a78767",0,.56,.67,1.06,.07,.54);
  box(shelves,"#bb9a77",0,.94,.67,1.06,.055,.54);
  for(const side of [-1,1]) box(shelves,"#9b8165",side*.523,.78,.67,.034,1.26,.55);
  box(shelves,"#ae9477",0,.79,.922,1.06,1.29,.035);
  box(shelves,"#9f8d76",0,1.452,.388,1.07,.089,.09);
  assemble(cabinet,shelves,{roughness:.84});
  const shutter=new T.Group(); cabinet.add(shutter); shutter.position.set(0,1.418,.38);
  const slats:T.BufferGeometry[]=[];
  for(let i=0;i<12;i++) box(slats,i%2?"#a2a594":"#b8baa7",0,-.042-i*.079,0,1.02,.082,.032);
  assemble(shutter,slats,{roughness:.76});
  for(let i=0;i<4;i++){
    const carton=i===0?template:template.clone();
    carton.name="Delivery carton "+(i+1); parent.add(carton); parcels.push(carton);
    load.push(new T.Vector3((i%2-.5)*.57,.917,-1.29+Math.floor(i/2)*.77));
    const p=new T.Vector3((i%2-.5)*.49,i<2?.747:1.122,.665);
    shelf.push(cabinet.localToWorld(p));
  }

  // The empty pickup turns in the clear straight section, leaves at the northern entrance,
  // and returns loaded in the inbound lane. Stock changes while the vehicle is off site.
  const road=(x:number,z:number)=>v3(sheetPoint(x,z),berth.y);
  const outbound=new T.CatmullRomCurve3([berth,
    berth.clone().add(new T.Vector3(-.09,0,1.39)), road(856.8,420),road(847,429),
    road(833,432),road(820,426),road(814,411),road(812,379),road(812,320),
    road(812,245),road(812,195),road(815,161),road(817,150)]);
  const inbound=new T.CatmullRomCurve3([road(847,150),road(847,190),road(846,248),
    road(846,278),road(849,304),road(856,329),road(862,351),
    berth.clone().add(new T.Vector3(0,0,-1.65)),berth]);
  const outLength=outbound.getLength(), inLength=inbound.getLength();
  const parcelStart=new T.Vector3(), travelTarget=new T.Vector3(), grip=new T.Vector3();
  const pose:PersonPose={x:0,z:0,floorY:0,heading:0,stride:0,walking:0,browsing:0,time:0};
  const lift=2.7, stow=2.4, align=1.20, turn=1.35;
  const visit=walkTime*2+align+lift+stow+turn;
  const dispatch=visit*4+.55, awaySpeed=2.60;
  const outDuration=outLength/awaySpeed+1, inDuration=inLength/awaySpeed+1;
  const loadReady=trafficPeriod-inDuration;
  const edge=sheetPoint(830,150).y;
  const truckMaterials=new Set<T.Material>();
  const shadowFade=shadowMaterial.clone();
  pickup.traverse(child=>{
    if(!(child instanceof T.Mesh))return;
    if(child.material===shadowMaterial) child.material=shadowFade;
    truckMaterials.add(child.material as T.Material);
  });
  const cartonMaterial=(template.children[0] as T.Mesh).material as T.Material;
  function fade(material:T.Material,opacity:number) {
    if(material.opacity===opacity)return;
    const transparent=opacity<1 || material===shadowFade;
    if(material.transparent!==transparent){
      material.transparent=transparent;
      material.needsUpdate=true;
    }
    material.opacity=opacity;
  }
  function drive(clock:number) {
    let opacity=1, mileage=0;
    pickup.visible=true; pickup.position.copy(berth); pickup.rotation.y=0;
    if(clock>=dispatch){
      const leaving=clock<dispatch+outDuration;
      const arriving=clock>=loadReady;
      if(leaving || arriving){
        const route=leaving?outbound:inbound, duration=leaving?outDuration:inDuration;
        const local=leaving?clock-dispatch:clock-loadReady;
        const ramp=2, speed=awaySpeed, dist=leaving ?
          (local<ramp?speed*local*local/(2*ramp):speed*(local-ramp*.5)) :
          (local<duration-ramp ? speed*local : inLength-speed*(duration-local)**2/(2*ramp));
        mileage=dist+(arriving?outLength:0);
        const u=T.MathUtils.clamp(dist/(leaving?outLength:inLength),0,1);
        route.getPointAt(u,pickup.position); route.getTangentAt(u,tangent);
        pickup.rotation.y=Math.atan2(tangent.x,tangent.z);
        opacity=ease((pickup.position.z-edge)/2.9);
      }else{pickup.visible=false;opacity=0;}
    }
    gate.rotation.x=Math.PI*.5*Math.max(1-ease(clock/1.5),ease((clock-dispatch+1.30)/1.30));
    for(const w of wheels) w.rotation.x=mileage/.29;
    for(const material of truckMaterials) fade(material,opacity);
    fade(cartonMaterial,clock>=loadReady?opacity:1);
    return opacity;
  }
  function walk(t:number,reverse:boolean) {
    const ramp=.55, velocity=length/(walkTime-ramp);
    const d=t<ramp ? velocity*t*t/(2*ramp) : t>walkTime-ramp ?
      length-velocity*(walkTime-t)**2/(2*ramp) : velocity*(t-ramp*.5);
    const u=T.MathUtils.clamp((reverse?length-d:d)/length,0,1);
    path.getPointAt(u,point); path.getTangentAt(u,tangent);
    pose.heading=Math.atan2(tangent.x,tangent.z)+(reverse?Math.PI:0);
    pose.walking=T.MathUtils.clamp(Math.min(t,walkTime-t)/ramp,0,1);
    pose.stride=(reverse?length+d:d)*Math.PI*2/1.38;
  }
  function update(time:number,openDoors:Set<number>) {
    // Start beside the tailgate with the first carton in hand.
    const clock=T.MathUtils.euclideanModulo(time+walkTime+align+lift-.45,trafficPeriod);
    const opacity=drive(clock);
    const trip=Math.min(4,Math.floor(clock/visit)), phase=clock-trip*visit;
    const restocked=clock>=loadReady;
    const shutterHeight=clock<dispatch?0:Math.min(ease((clock-dispatch)/1.6),ease((trafficPeriod-clock)/1.6));
    shutter.scale.y=Math.max(.001,shutterHeight);
    let carry=0,crouch=0,fromBed=0,toShelf=0;
    point.copy(destination);
    pose.time=time;pose.walking=0;pose.browsing=0;pose.heading=homeHeading+Math.PI;
    if(trip<4){
      let t=phase;
      if(t<walkTime){
        walk(t,true);
      }else if((t-=walkTime)<align){
        point.copy(tail); pose.heading=angle(depart+Math.PI,0,t/align);
      }else if((t-=align)<lift){
        point.copy(tail);
        const reach=ease(t/.84),take=ease((t-.83)/1.10);
        pose.heading=angle(0,depart,(t-1.84)/.86);
        carry=reach;crouch=.69*(1-take)*reach;
        fromBed=ease(t/1.55);
      }else if((t-=lift)<walkTime){
        walk(t,false);carry=1;fromBed=1;
      }else if((t-=walkTime)<stow){
        pose.heading=homeHeading;fromBed=1;
        const lower=ease(t/.86);
        crouch=(trip<2?.85:.2)*lower*(1-ease((t-1.65)/.75));
        toShelf=ease((t-.32)/1.36);carry=1-ease((t-1.45)/.9);
      }else{
        t-=stow;
        pose.heading=angle(homeHeading,homeHeading+Math.PI,t/turn);
        fromBed=1;toShelf=1;
      }
    }else{
      pose.browsing=.35+.32*Math.sin(clock*.62);
    }
    pose.x=point.x;pose.z=point.z;pose.floorY=point.y;
    pose.carrying=carry;pose.crouch=crouch;
    if(trip<4 && point.distanceToSquared(door)<2.35**2)openDoors.add(serviceShopId);
    grip.set(point.x+Math.sin(pose.heading)*.32,point.y+.99-crouch*.22+pose.walking*.012*Math.sin(pose.stride*2),point.z+Math.cos(pose.heading)*.32);
    for(const [i,carton] of parcels.entries()){
      const onTruck=restocked || i>trip || (i===trip && fromBed===0);
      carton.visible=true;
      if(onTruck){
        travelTarget.copy(load[i]).applyAxisAngle(up,pickup.rotation.y).add(pickup.position);
        carton.position.copy(travelTarget);carton.rotation.y=pickup.rotation.y;
        carton.visible=pickup.visible && opacity>.001;
      }else if(i<trip){
        carton.position.copy(shelf[i]);carton.rotation.y=homeHeading;
      }else{
        parcelStart.copy(load[i]).add(berth);
        carton.position.copy(parcelStart).lerp(grip,fromBed).lerp(shelf[i],toShelf);
        carton.rotation.y=angle(angle(0,pose.heading,fromBed),homeHeading,toShelf);
      }
    }
  }
  return {id:serviceShopId,pose,update};
}
const up=new T.Vector3(0,1,0);
