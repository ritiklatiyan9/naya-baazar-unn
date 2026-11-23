import * as T from "three";
import { garmentGeometry, headGeometry } from "./shopperAppearance";
import { assemble, box, oval, part, rod, roadShadow } from "./vehicleGeometry";

function wheel(cycle: boolean, radius: number, depth: number) {
  const g = new T.Group(), pieces: T.BufferGeometry[] = [];
  const axle = (color: string, r: number, width: number) =>
    part(pieces, new T.CylinderGeometry(r, r, width, 20).rotateZ(Math.PI / 2), color);
  if (cycle) {
    part(pieces, new T.TorusGeometry(radius * .84, radius * .16, 8, 24).rotateY(Math.PI / 2), "#353837");
    for (const side of [-1, 1]) {
      part(pieces, new T.TorusGeometry(radius * .73, .014, 5, 24).rotateY(Math.PI / 2), "#b8b7ac", side * .036);
    }
    for (let n = 0; n < 6; n++) {
      const ang = n * Math.PI / 6;
      const y = Math.sin(ang) * radius * .73, z = Math.cos(ang) * radius * .73;
      rod(pieces, "#929b98", [0,-y,-z], [0,y,z], .012);
    }
    axle("#797e7c", .052, .14);
  } else {
    axle("#343736", radius, depth);
    axle("#c1c2b9", radius * .70, depth + .012);
    axle("#676e6b", radius * .43, depth + .019);
    axle("#b7b7a9", radius * .27, depth + .024);
    for (const side of [-1,1]) for(let i=0;i<5;i++){
      const a=i*Math.PI*2/5;
      oval(pieces,"#626966",side*(depth*.5+.015),radius*.46*Math.cos(a),radius*.46*Math.sin(a),.013,.022,.022);
    }
  }
  assemble(g, pieces, {roughness:.63});
  return g.children[0] as T.Mesh;
}

/** Rider and chassis share one body draw, with two independently rotating wheels. */
export function riddenBike(parent: T.Group, scooter: boolean, shadowMaterial: T.Material) {
  const group = new T.Group(), pieces: T.BufferGeometry[] = [];
  group.name = scooter ? "Sage scooter with helmeted rider" : "Touring motorcycle with helmeted rider";
  parent.add(group);
  const paint = scooter ? "#829a8e" : "#a65e45", dark = "#384345", metal = "#b3b7aa";
  const wheelR = scooter ? .265 : .31, rear = -.68, front = .69;
  const rearWheel = wheel(true, wheelR, .105), frontWheel = rearWheel.clone();
  rearWheel.position.set(0, wheelR, rear); frontWheel.position.set(0, wheelR, front);
  group.add(rearWheel, frontWheel);
  roadShadow(group,shadowMaterial,1.02,2.32);
  rod(pieces, dark,[0,.45,-.12],[0,.88,.46],.052);
  rod(pieces, dark,[0,.74,-.33],[0,.88,.46],.045);
  rod(pieces, metal,[0,.88,.46],[0,1.005,.46],.033);
  for (const s of [-1,1]) {
    rod(pieces, metal, [s*.10,wheelR,front],[s*.10,.91,.48],.028,.035);
    rod(pieces, dark,[s*.09,wheelR,rear],[s*.105,.46,.14],.035);
    rod(pieces, metal,[s*.095,.37,-.61],[s*.14,.72,-.37],.025);
    rod(pieces, "#515c5a", [s*.13,.42,-.55],[s*.15,.47,-.09],.071);
    rod(pieces, "#565c57",[s*.095,.34,.02],[s*.23,.34,.02],.025);
    rod(pieces, metal,[0,1,.46],[s*.27,1.02,.37],.022);
    rod(pieces, dark,[s*.23,1.02,.37],[s*.32,1.02,.365],.027);
    rod(pieces, metal,[s*.245,1.02,.43],[s*.31,1.18,.45],.011);
    oval(pieces,"#838f8b",s*.31,1.19,.45,.087,.053,.045);
  }
  if (scooter) {
    oval(pieces,paint,0,.55,-.42,.41,.43,.76);
    box(pieces,dark,0,.35,.11,.43,.065,.53);
    box(pieces,paint,0,.68,.39,.43,.60,.13,.20);
    oval(pieces,paint,0,.99,.48,.33,.16,.17);
  } else {
    oval(pieces,paint,0,.74,.14,.32,.3,.51,-.1);
    box(pieces,dark,0,.44,-.04,.29,.31,.4);
    for (let i=0;i<4;i++) box(pieces,metal,0,.4+i*.04,0,.31,.014,.31);
    oval(pieces,paint,0,.62,-.60,.30,.14,.46);
  }
  oval(pieces,dark,0,.745,-.28,.34,.14,.62);
  oval(pieces,paint,0,wheelR*1.86,front,.16,.09,.43);
  oval(pieces,metal,0,.94,.514,.19,.148,.099);
  oval(pieces,"#f4e2b7",0,.94,.55,.165,.121,.057);
  box(pieces,"#a84137",0,.64,-.77,.15,.075,.04);

  const fabric = scooter ? "#ba8169" : "#596b81", jeans = scooter ? "#495b5c" : "#4d515b";
  const skin = scooter ? "#b77f60" : "#a66e50";
  oval(pieces,jeans,0,.82,-.22,.35,.24,.31);
  part(pieces,garmentGeometry(false),fabric,0,.838,-.216,1.02,.98,.98,.17);
  const trim=scooter?"#d2a28c":"#80909c";
  rod(pieces,trim,[0,.90,-.072],[0,1.254,-.033],.006);
  oval(pieces,trim,0,1.302,-.132,.13,.045,.14,.16);
  rod(pieces,skin,[0,1.28,-.1],[0,1.39,-.09],.058);
  part(pieces,headGeometry(),skin,0,1.327,-.075);
  const helmet = scooter ? "#f2dbc0" : "#556c6a";
  part(pieces,new T.SphereGeometry(.5,22,12,0,Math.PI*2,0,1.91),helmet,0,1.475,-.078,.236,.251,.27);
  part(pieces,new T.SphereGeometry(.5,14,5,.37,Math.PI-.74,1.17,.56),"#536064",0,1.476,-.073,.244,.261,.287);
  oval(pieces,"#a67c66",0,1.39,.025,.048,.009,.013);
  for (const s of [-1,1]) {
    oval(pieces,helmet,s*.093,1.44,-.10,.045,.092,.088);
    rod(pieces,"#504c45",[s*.082,1.438,-.066],[s*.05,1.344,-.042],.009);
    oval(pieces,fabric,s*.166,1.228,-.134,.164,.158,.167,-.28);
    rod(pieces,fabric,[s*.167,1.23,-.12],[s*.208,1.02,.075],.086,.065);
    oval(pieces,skin,s*.208,1.021,.075,.114,.106,.111);
    rod(pieces,skin,[s*.208,1.02,.074],[s*.266,1.025,.334],.052,.037);
    oval(pieces,skin,s*.27,1.02,.358,.087,.069,.087);
    rod(pieces,jeans,[s*.102,.835,-.20],[s*.20,.64,.185],.099,.073);
    oval(pieces,jeans,s*.20,.64,.185,.151,.15,.15);
    rod(pieces,jeans,[s*.20,.64,.185],[s*.185,.38,scooter?.15:-.015],.072,.05);
    oval(pieces,"#67574a",s*.185,.354,scooter?.20:.03,.122,.092,.23);
  }
  assemble(group,pieces,{roughness:.62,metalness:.08});
  return (point:T.Vector3, heading:number, travel:number, bank:number) => {
    group.position.set(point.x,.034,point.z); group.rotation.set(0,heading,bank,"YXZ");
    rearWheel.rotation.x = frontWheel.rotation.x = travel/wheelR;
  };
}

export function deliveryPickup(parent: T.Group, shadowMaterial:T.Material) {
  const group = new T.Group(), pieces: T.BufferGeometry[] = [];
  group.name = "Stock delivery · open-bed pickup";
  parent.add(group);
  roadShadow(group,shadowMaterial,2.2,4.80);
  const ivory = "#dbd2b7", teal = "#62877c", frame = "#525b56";
  box(pieces,frame,0,.46,0,1.45,.19,3.87);
  box(pieces,ivory,0,.72,.95,1.56,.57,1.65);
  box(pieces,teal,0,1.05,1.52,1.56,.16,.48,-.06);
  box(pieces,ivory,0,1.47,.32,1.49,.90,.09);
  box(pieces,frame,0,1.60,.267,1.15,.38,.026);
  box(pieces,"#728985",0,1.60,.249,1.065,.30,.018);
  box(pieces,frame,0,1.60,.238,.028,.31,.012);
  box(pieces,"#a04d40",0,1.852,.267,.26,.038,.022);
  box(pieces,ivory,0,1.93,.75,1.57,.12,.93);
  box(pieces,"#66868a",0,1.50,1.245,1.36,.74,.05,-.20);
  for (const side of [-1,1]) {
    const x = side*.744;
    rod(pieces,ivory,[x,1.06,1.37],[x,1.89,1.17],.046);
    box(pieces,"#73908f",x,1.49,.73,.045,.69,.73);
    box(pieces,teal,side*.788,.90,.78,.024,.06,1.08);
    box(pieces,frame,side*.80,1.05,.49,.025,.033,.125);
    rod(pieces,frame,[x,1.30,1.03],[side*.91,1.29,.99],.018);
    oval(pieces,frame,side*.93,1.29,.99,.11,.17,.10);
    box(pieces,"#ece4c4",side*.55,.85,1.787,.32,.13,.034);
    box(pieces,"#b85c47",side*.62,.67,-1.98,.18,.082,.04);
    // Low ribbed sides leave the load visible from the street and from the overview.
    box(pieces,teal,x,.86,-.89,.067,.37,2.11);
    for(let n=0;n<4;n++) box(pieces,"#9da99b",x+side*.038,.87,-1.83+n*.56,.025,.32,.038);
  }
  box(pieces,frame,0,.67,1.80,.72,.17,.04);
  box(pieces,"#d5ba80",0,.56,1.84,.40,.09,.025);
  box(pieces,"#a99c80",0,.675,-.88,1.47,.082,2.15);
  for(let n=0;n<7;n++) box(pieces,"#bfad8a",-.60+n*.20,.72,-.89,.022,.015,2.08);
  assemble(group,pieces,{roughness:.55,metalness:.10});
  const gate=new T.Group(), gateParts:T.BufferGeometry[]=[];
  gate.position.set(0,.72,-1.88);group.add(gate);
  box(gateParts,teal,0,0,-.22,1.47,.054,.46);
  for (const x of [-.52,.52]) box(gateParts,"#b4b5a6",x,-.033,-.22,.065,.018,.38);
  box(gateParts,"#d6bb84",0,-.037,-.22,.34,.018,.107);
  assemble(gate,gateParts,{roughness:.59,metalness:.13});
  const tire=wheel(false,.29,.17), wheels:T.Mesh[]=[];
  for(const s of [-1,1]) for(const z of [-1.24,1.04]) {
    const w=tire.clone(); w.position.set(s*.716,.29,z); group.add(w);wheels.push(w);
  }
  return {group,gate,wheels};
}

export function stockCarton() {
  const carton = new T.Group(), parts: T.BufferGeometry[] = [];
  box(parts,"#bc925f",0,0,0,.44,.30,.33);
  box(parts,"#dabb83",0,.151,0,.075,.006,.333);
  box(parts,"#dabb83",0,.04,.166,.075,.225,.005);
  box(parts,"#f0dbb6",-.115,.025,.168,.083,.057,.005);
  assemble(carton,parts,{roughness:.91});
  return carton;
}
