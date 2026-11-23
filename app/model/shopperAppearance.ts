import * as T from "three";

const tau = Math.PI * 2;
/** Vertex rings follow the jaw, cheekbones and skull at real head scale. */
const skull = [
  [-.008,.007,.039,.055],[0,.042,.078,.062],[.020,.064,.094,.077],[.053,.078,.098,.094],
  [.087,.088,.096,.105],[.118,.097,.099,.108],[.15,.099,.095,.107],[.183,.098,.099,.103],
  [.212,.089,.097,.096],[.232,.069,.076,.081],[.249,.039,.044,.049],[.257,.003,.003,.004],
];
function skullPoint(theta:number, y:number) {
  let i=1;
  while(i<skull.length-1 && skull[i][0]<y)i++;
  const a=skull[i-1], b=skull[i];
  const f=T.MathUtils.clamp((y-a[0])/(b[0]-a[0]),0,1);
  const front=Math.cos(theta);
  const width=T.MathUtils.lerp(a[1],b[1],f);
  const x=Math.sin(theta)*width;
  const depth=T.MathUtils.lerp(front>=0?a[2]:a[3],front>=0?b[2]:b[3],f);
  let z=front*depth;
  if(front>0){
    const bump=(cx:number,cy:number,wx:number,wy:number)=>Math.exp(-(((x-cx)/wx)**2+((y-cy)/wy)**2));
    // These volumes carry the silhouette when seen in profile; the portrait follows this same surface.
    z+=front*(.020*bump(0,.125,.014,.047)+.029*bump(0,.092,.021,.014)
      +.007*bump(0,.057,.033,.012)+.004*bump(0,.024,.037,.013)
      +.006*bump(.045,.115,.027,.020)+.006*bump(-.045,.115,.027,.020)
      -.005*bump(.038,.145,.023,.012)-.005*bump(-.038,.145,.023,.012));
  }
  return new T.Vector3(x,y,z);
}

type Sample = { p:T.Vector3; u:number; v:number; alpha?:number };
function surface(rows:number,columns:number, point:(u:number,v:number)=>Sample) {
  const positions:number[]=[], uv:number[]=[], colors:number[]=[], indices:number[]=[];
  for(let row=0;row<=rows;row++)for(let column=0;column<=columns;column++){
    const sample=point(column/columns,row/rows);
    positions.push(...sample.p.toArray());
    uv.push(sample.u,sample.v);
    if(sample.alpha!==undefined)colors.push(1,1,1,sample.alpha);
    if(row<rows && column<columns){
      const i=row*(columns+1)+column;
      indices.push(i,i+1,i+columns+2,i,i+columns+2,i+columns+1);
    }
  }
  const geo=new T.BufferGeometry();
  geo.setAttribute("position",new T.Float32BufferAttribute(positions,3));
  geo.setAttribute("uv",new T.Float32BufferAttribute(uv,2));
  if(colors.length)geo.setAttribute("color",new T.Float32BufferAttribute(colors,4));
  geo.setIndex(indices);geo.computeVertexNormals();
  return geo;
}

export function headGeometry() {
  return surface(16,24,(u,v)=>({p:skullPoint((u-.5)*tau,-.008+.265*v),u,v}));
}
export function hairGeometry() {
  return surface(9,30,(u,v)=>{
    const a=(u-.5)*tau, front=Math.cos(a);
    const temple=Math.pow(Math.max(0,front),1.7);
    const line=.071+.139*temple+.009*Math.sin(3*a)*Math.max(0,front)+.005*Math.sin(9*a);
    const y=T.MathUtils.lerp(line,.257,v),p=skullPoint(a,y);
    const strands=(1-v)*(.0014*Math.sin(32*a+2*v)+.001*Math.sin(47*a-v));
    p.x+=Math.sin(a)*(.0038+strands);p.z+=front*(.004+strands);
    p.y+=.004+v*.008;
    return {p,u,v};
  });
}
export function portraitGeometry() {
  return surface(21,24,(u,v)=>{
    const a=(u-.5)*2.84, y=.001+v*.221;
    const p=skullPoint(a,y);
    p.x+=Math.sin(a)*.0014;p.z+=Math.cos(a)*.0015;
    const alpha=T.MathUtils.smoothstep(v,0,.095)*(1-T.MathUtils.smoothstep(v,.90,1))
      *(1-T.MathUtils.smoothstep(Math.abs(u-.5),.36,.5));
    const faceY=y<.145? .94-(y/.145)*.48 : .46-(y-.145)/.077*.327;
    return {p,u:.50+p.x*4.04,v:1-faceY,alpha};
  });
}

export function shopperPortraits(){
  const material=new T.MeshStandardMaterial({
    vertexColors:true, transparent:true, roughness:.9, depthWrite:false,
    polygonOffset:true, polygonOffsetFactor:-1,
  });
  material.visible=false;
  material.onBeforeCompile=shader=>{
    shader.vertexShader=shader.vertexShader.replace("#include <common>","#include <common>\nattribute float portraitCell;")
      .replace("#include <uv_vertex>","#include <uv_vertex>\n#ifdef USE_MAP\n vMapUv=(vMapUv+vec2(mod(portraitCell,4.0),1.0-floor(portraitCell/4.0)))/vec2(4.0,2.0);\n#endif");
  };
  // Browsers decode the atlas once. A paused scene repaints as soon as the faces are available.
  const ready=typeof Image==="undefined"?Promise.resolve():new Promise<void>(resolve=>{
    const map=new T.TextureLoader().load("/media/shopper-faces.webp",()=>{
      material.visible=true;material.needsUpdate=true;resolve();
    },undefined,()=>resolve());
    map.colorSpace=T.SRGBColorSpace; map.anisotropy=4; material.map=map;
  });
  return {material,ready};
}

export type Garment="workwear"|"linen"|"shirt"|"tunic"|"denim"|"hair";
export function clothTexture(style:Garment){
  const c=document.createElement("canvas");c.width=c.height=256;
  const ctx=c.getContext("2d")!,w=c.width;
  let seed=182;
  const noise=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  const image=ctx.createImageData(w,w);
  for(let y=0;y<w;y++)for(let x=0;x<w;x++){
    const u=x/w, v=y/w;
    let tint=244+(noise()-.5)*10+((x+y)%2)*3;
    if(style==="hair"){
      tint=224+18*Math.cos(x*.57+v*3)+12*Math.cos(x*.83-v*2)+(noise()-.5)*12;
    } else {
      const crease=(cx:number,cy:number,rx:number,ry:number,slope:number)=>
        Math.exp(-(((u-cx)/rx)**2+((v-cy-(u-cx)*slope)/ry)**2));
      tint-=18*crease(.41,.82,.075,.018,-1.2)+14*crease(.58,.86,.065,.017,1.3)+10*crease(.44,.74,.045,.011,-1.45);
      tint-=18*crease(.12,.23,.048,.018,.8)+16*crease(.87,.20,.043,.016,-.9);
      if(style==="denim")tint-=((x+2*y)%5<2?11:0)+8*crease(.54,.65,.22,.025,.32);
      if(style==="shirt")tint-=x%19<2?18:0;
      if(style==="tunic" && y>45 && (((x+((y>>4)%2)*8)%17)-8)**2+((y%16)-8)**2<6)tint-=36;
    }
    const i=(y*w+x)*4;
    image.data[i]=image.data[i+1]=image.data[i+2]=tint;image.data[i+3]=255;
  }
  ctx.putImageData(image,0,0);
  function line(points:number[][],colour:string,width=1){
    ctx.beginPath();ctx.lineWidth=width;ctx.strokeStyle=colour;
    points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke();
  }
  if (style === "workwear") {
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = "#e19239";
    ctx.fillRect(0, 0, w, w);
    ctx.globalCompositeOperation = "source-over";
    // The navy undershirt shows through the V of the waistcoat at the neck.
    ctx.fillStyle = "#324450";
    ctx.beginPath();
    ctx.moveTo(109, 0); ctx.lineTo(129, 64); ctx.lineTo(148, 0); ctx.fill();
    for (const x of [20, 105, 151, 236]) {
      line([[x, 0], [x + (x > 127 ? 3 : -3), 145]], "#d7d8be", 8);
    }
    for (const y of [143, 165]) {
      ctx.fillStyle = "#c9ccb8";
      ctx.fillRect(0, y, w, 10);
      line([[0, y + 1], [w, y + 1]], "#f2efd6");
    }
    line([[129, 61], [129, 251]], "#645d50", 2);
    line([[98, 196], [112, 208], [111, 227]], "#96652f", 2);
    line([[160, 196], [147, 208], [147, 227]], "#96652f", 2);
  }
  if(style==="shirt"||style==="tunic"){
    const end=style==="shirt"?250:89;
    line([[125,15],[125,end]],"rgba(28,24,21,.26)",2);
    line([[131,15],[131,end]],"rgba(255,255,252,.48)");
    for(let y=34;y<end;y+=28){
      ctx.beginPath();ctx.fillStyle="rgba(60,53,48,.64)";ctx.arc(127.5,y,1.8,0,tau);ctx.fill();
      ctx.fillStyle="rgba(253,250,237,.85)";ctx.fillRect(127,y-1,1.5,1.5);
    }
    if(style==="shirt"){
      line([[138,81],[156,80],[156,108],[148,112],[138,108],[138,81]],"rgba(55,47,40,.48)",1.8);
      line([[138,85],[156,84]],"rgba(255,255,255,.48)");
    }
  }
  if(style!=="hair"){
    line([[0,248],[255,248]],"rgba(35,30,25,.28)",1.5);
    line([[0,251],[255,251]],"rgba(255,255,255,.5)");
    for(const x of [64,193])line([[x,8],[x-1,135],[x+2,249]],"rgba(55,50,48,.21)",1.4);
  }
  const texture=new T.CanvasTexture(c);texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=4;
  return texture;
}

export function garmentGeometry(hem:boolean) {
  const rings=hem?[
    [-.182,.215,.208],[-.174,.214,.205],[-.109,.208,.169],[-.038,.196,.143],[.031,.184,.121],[.12,.162,.104],
  ]:[
    [-.051,.192,.138],[-.041,.193,.139],[-.007,.185,.129],[.048,.177,.115],[.125,.167,.106],
    [.210,.157,.105],[.285,.164,.114],[.345,.183,.122],[.386,.194,.116],
    [.402,.201,.106],[.424,.189,.093],[.446,.157,.079],[.467,.116,.067],[.486,.059,.054],
  ];
  return surface(rings.length-1,30,(u,v)=>{
    const [y,rx,rz]=rings[Math.round((rings.length-1)*v)];
    const a=(u-.5)*tau;
    const fabric=.0038*Math.cos(11*a+v*2)*(1-v)+.0025*Math.sin(17*a-v*3)*(1-v);
    const p=new T.Vector3(Math.sin(a)*(rx+fabric),y,Math.cos(a)*(rz+fabric)+.006*Math.sin(v*Math.PI));
    return {p,u,v:(y-rings[0][0])/(rings[rings.length-1][0]-rings[0][0])};
  });
}

export function apronGeometry() {
  // The bib narrows above the waistband. The lower apron follows the front of the hips.
  const sections = [
    [-.201,.186,.236,.179],[-.192,.188,.236,.18],[-.085,.181,.235,.155],
    [.023,.176,.221,.144],[.12,.159,.207,.123],[.144,.144,.204,.12],
    [.245,.104,.20,.128],[.358,.111,.203,.145],[.388,.108,.206,.140],
  ];
  return surface(sections.length - 1, 18, (u, v) => {
    const [y, width, torsoWidth, depth] = sections[Math.round(v * (sections.length - 1))];
    const x = (u * 2 - 1) * width;
    const fold = .0038 * Math.cos(u * 21) * (1 - v);
    const z = depth * Math.sqrt(1 - (x / torsoWidth) ** 2) + fold;
    return { p: new T.Vector3(x,y,z), u, v };
  });
}
