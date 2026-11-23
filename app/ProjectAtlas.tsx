"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import plan from "../src/plan-data.json";
import PlanCanvas from "./PlanCanvas";
import { Icon } from "./icons";

type Floor = "ground" | "first";
type Status = "available" | "booked";
type Availability = { id: number; status: Status; version: number };
type Inventory = Record<number, Availability>;
type Unit = typeof plan[number];
type User = { email: string };
type View = "layout" | "details" | "walkthrough" | "gallery";
const pages: { id: View; label: string }[] = [
  {id:"layout", label:"Floor plans"}, {id:"details", label:"Project details"},
  {id:"walkthrough", label:"Walkthrough"}, {id:"gallery", label:"Photos & videos"}
];
const floorName = (floor: string) => floor === "ground" ? "Ground floor" : "First floor";
const unitName = (id: number) => "Shop " + String(id).padStart(2, "0");
const numberText = (feet: string) => feet.replaceAll("'", "′").replaceAll('"', "″");
const statusLabel = (s?: Status) => s === "available" ? "Available" : s === "booked" ? "Booked" : "Unconfirmed";
const projectViews = [
  {id:"10", label:"Aerial perspective"}, {id:"08", label:"Market street"}, {id:"12", label:"Central plaza"}
];

function Brand() {
  return <a className="brand" href="#layout" aria-label="Naya Baazar floor plans">
    <img src="/favicon.svg" alt="" width="43" height="43"/>
    <span><strong>Naya Baazar</strong><small>BY DEFENCE GARDEN</small></span>
  </a>;
}

function Hero() {
  const [index,setIndex] = useState(0);
  const current = projectViews[index];
  return <section className="hero" aria-label="Naya Baazar project">
    <img className="hero-photo" src={"/media/render-" + current.id + ".webp"} alt={current.label + " of the proposed market"} fetchPriority="high"/>
    <div className="hero-shade"/>
    <div className="hero-copy"><p className="hero-kicker"><span/>COMMERCIAL DEVELOPMENT</p>
      <h1>Naya Baazar</h1><p className="hero-location"><Icon name="pin" size={17}/>Unn, Shamli, Uttar Pradesh</p>
    </div>
    <div className="hero-paging"><span>{current.label}</span><div>
      {projectViews.map((photo, i) => <button key={photo.id} className={i === index ? "active" : ""} onClick={() => setIndex(i)} aria-pressed={i === index} aria-label={"Show " + photo.label}/>)}
    </div></div>
  </section>;
}

function useData() {
  const [inventory,setInventory] = useState<Inventory>({});
  const [network,setNetwork] = useState<"loading" | "live" | "error">("loading");
  const [user,setUser] = useState<User|null>(null);
  const merge = useCallback((rows: Availability[]) => {
    setInventory(previous => {
      const next = {...previous};
      for (const row of rows) {
        if (!next[row.id] || row.version >= next[row.id].version) next[row.id] = row;
      }
      return next;
    });
  }, []);
  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/shops", {cache:"no-store"});
      if (!response.ok) throw new Error();
      const data = await response.json() as {shops:Availability[]};
      if (!Array.isArray(data.shops) || data.shops.length !== plan.length) throw new Error();
      merge(data.shops);
      setNetwork("live");
    } catch { setNetwork("error"); }
  }, [merge]);
  const sessionVersion = useRef(0);
  const changeUser = useCallback((value: User|null) => { sessionVersion.current++; setUser(value); }, []);
  useEffect(() => {
    const version = sessionVersion.current;
    fetch("/api/session", {cache:"no-store"}).then(r => r.ok ? r.json() as Promise<{user:User|null}> : null).then(data => {
      if(data && sessionVersion.current === version) setUser(data.user);
    }).catch(() => {});
    void refresh();
    const onFocus = () => { if (!document.hidden) void refresh(); };
    const timer = window.setInterval(onFocus,30000);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onFocus); };
  }, [refresh]);
  return {inventory,network,merge,refresh,user,changeUser};
}

function Login({onClose,onUser}:{onClose:()=>void;onUser:(user:User)=>void}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [waiting,setWaiting] = useState(false);
  const [show,setShow] = useState(false);
  const [error,setError] = useState("");
  useEffect(() => { const el = ref.current; el?.showModal(); return () => el?.close(); }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setWaiting(true); setError("");
    try {
      const response = await fetch("/api/login", {method:"POST", headers:{"Content-Type":"application/json"},body:JSON.stringify({email:data.get("email"),password:data.get("password")})});
      const result = await response.json() as {error?:string;user:User};
      if (!response.ok) throw new Error(result.error || "Sign-in failed. Try again.");
      onUser(result.user);
    } catch(e) { setError(e instanceof Error ? e.message : "Unable to reach the server."); }
    finally { setWaiting(false); }
  }
  return <dialog ref={ref} className="login-dialog" aria-labelledby="login-heading" onCancel={onClose} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
    <div className="dialog-body"><div className="dialog-top"><img src="/favicon.svg" width="46" height="46" alt=""/><button className="icon-button" type="button" onClick={onClose} aria-label="Close login"><Icon name="close"/></button></div>
      <h2 id="login-heading">Staff login</h2><p>Sign in to manage shop availability on both floors.</p>
      <form onSubmit={submit}><label>Email address<input type="email" name="email" autoComplete="username" required autoFocus/></label>
      <label>Password<span className="password-box"><input type={show?"text":"password"} name="password" autoComplete="current-password" required/><button type="button" onClick={()=>setShow(!show)} aria-label={show?"Hide password":"Show password"} aria-pressed={show}><Icon name="eye"/></button></span></label>
      {error && <p className="error-text" role="alert">{error}</p>}
      <button className="primary-button" disabled={waiting}>{waiting?"Signing in…":"Sign in"}</button></form>
    </div>
  </dialog>;
}

function ShopDetails({unit,record,admin,online,onBack,onSave}:{unit:Unit;record?:Availability;admin:boolean;online:boolean;onBack:()=>void;onSave:(status:Status,version:number)=>Promise<string>}) {
  const [choice,setChoice] = useState<Status|undefined>(record?.status);
  const [version,setVersion] = useState(record?.version);
  const [message,setMessage] = useState("");
  const [saving,setSaving] = useState(false);
  const dirty = choice !== record?.status;
  useEffect(() => {
    if (version === undefined || !dirty) {setChoice(record?.status);setVersion(record?.version);}
  }, [record?.version,record?.status,version,dirty]);
  async function save(){
    if(!choice || version === undefined || saving) return;
    setSaving(true); setMessage("");
    try {const result = await onSave(choice,version); setMessage(result);setVersion(undefined);}
    catch(e){setMessage(e instanceof Error ? e.message : "Could not save. Try again.");}
    finally{setSaving(false);}
  }
  return <div className="shop-details">
    <button className="back-link" onClick={onBack}><Icon name="back" size={14}/> Shop directory</button>
    <div className="shop-title"><h3>{unitName(unit.id)}</h3><span className={"status-pill "+(record?.status || "unknown")}><i/>{statusLabel(record?.status)}</span></div>
    <p className="shop-floor">{floorName(unit.floor)}</p>
    <div className="measure-heading"><Icon name="ruler" size={16}/> Internal dimensions</div>
    <dl className="measurements"><div><dt>Feet & inches</dt><dd>{numberText(unit.feet)}</dd></div><div><dt>Metres</dt><dd>{unit.metres} m</dd></div></dl>
    <p className="dimension-note">{unit.irregular ? "Irregular outline. Spans enclose the shop and include recesses." : "Approximate internal spans, short side first."}</p>
    {admin && <form className="editor" onSubmit={e=>{e.preventDefault();void save();}}>
      <fieldset disabled={saving || !online || !record}><legend>Booking status</legend><div className="status-choices">{(["available","booked"] as const).map(s=><label key={s}><input type="radio" name="booking-status" checked={choice===s} onChange={()=>{if(!dirty)setVersion(record?.version);setChoice(s);setMessage("");}}/>{statusLabel(s)}</label>)}</div></fieldset>
      <button className="primary-button" disabled={saving || !online || !record || !dirty}>{saving?"Saving…":"Save status"}</button>
      {message && <p className="save-message" role="status">{message}</p>}
    </form>}
  </div>;
}

function Directory({floor,inventory,selected,user,online,onSelect,onBack,onSave}:{floor:Floor;inventory:Inventory;selected:number|null;user:User|null;online:boolean;onSelect:(id:number)=>void;onBack:()=>void;onSave:(status:Status,version:number)=>Promise<string>}) {
  const [query,setQuery] = useState("");
  const filtered = plan.filter(u => query.trim() ? String(u.id).includes(query.trim().replace(/^0+(?=\d)/,"")) : u.floor===floor);
  const unit = plan.find(u=>u.id===selected);
  return <aside className={"directory card" + (user?" staff":"")} aria-label={user?"Shop management":"Shop directory"}>
    <div className="directory-title"><span className="panel-icon"><Icon name={user?"lock":"shops"} size={21}/></span><div><p className="eyebrow">{user?"STAFF WORKSPACE":"SHOP INVENTORY"}</p><h2>{user?"Manage shops":"Shop directory"}</h2></div></div>
    {unit ? <ShopDetails key={unit.id} unit={unit} record={inventory[unit.id]} admin={!!user} online={online} onBack={onBack} onSave={onSave}/> : <>
      <label className="directory-search"><Icon name="search"/><input aria-label="Find shop by number" placeholder="Find shop by number" value={query} onChange={e=>setQuery(e.target.value)} inputMode="numeric"/>{query && <button type="button" aria-label="Clear search" onClick={()=>setQuery("")}><Icon name="close" size={15}/></button>}</label>
      <div className="directory-meta"><span>{query.trim()?"Search results":floorName(floor)}</span><span>{filtered.length} {filtered.length===1?"shop":"shops"}</span></div>
      <ul className="unit-list">{filtered.map(u=><li key={u.id}><button onClick={()=>onSelect(u.id)}><span className={"unit-icon "+(inventory[u.id]?.status || "unknown")}><Icon name="shops" size={17}/></span><span className="unit-info"><strong>{unitName(u.id)}</strong><small>{query.trim()?floorName(u.floor)+" · ":""}{numberText(u.feet)}</small></span><span className={"unit-status "+(inventory[u.id]?.status || "unknown")} title={statusLabel(inventory[u.id]?.status)}><i/><span className="sr">{statusLabel(inventory[u.id]?.status)}</span></span><Icon name="chevron" size={13}/></button></li>)}</ul>
      {!filtered.length && <div className="empty-list">No shop matches that number.</div>}
    </>}
  </aside>;
}

function ProjectDetails() {
  return <section className="details-view"><div className="section-heading"><div><p className="eyebrow">THE DEVELOPMENT</p><h2>Project details</h2></div></div>
    <div className="details-grid"><figure><img src="/media/render-12.webp" alt="The landscaped central plaza and two levels of shopfronts"/><figcaption>Central plaza · Architectural render</figcaption></figure>
    <article><p className="eyebrow">UNN, SHAMLI</p><h3>An open-air market around a courtyard.</h3><p>Naya Baazar brings two floors of shops together around a landscaped plaza. Covered walkways connect the shopfronts, with an internal driveway running through the market.</p>
    <dl className="project-facts"><div><dt>Developer</dt><dd>Defence Garden</dd></div><div><dt>Location</dt><dd>Unn, Shamli, Uttar Pradesh</dd></div><div><dt>Ground floor</dt><dd>108 shops · Nos. 1–108</dd></div><div><dt>First floor</dt><dd>108 shops · Nos. 112–219</dd></div></dl>
    <a href="https://defencegarden.com/" target="_blank" rel="noreferrer" className="text-link">Visit Defence Garden</a></article></div>
    <div className="drawing-note"><Icon name="info" size={20}/><div><h3>Reading the drawings</h3><p>Shop sizes show approximate internal enclosing spans, short side first. The dimension register flags irregular shapes. The source drawing also flags a boundary labelled 36.00 m that measures about 36.73 m at its stated scale.</p><a className="text-link" href="/plans/naya-baazar-sizes.pdf" download>Download the original drawings and register</a></div></div>
  </section>;
}

function MediaView({view}:{view:"gallery"|"walkthrough"}) {
  const ref = useRef<HTMLDivElement>(null);
  const [failed,setFailed] = useState(false);
  const [attempt,setAttempt] = useState(0);
  useEffect(()=>{
    let active=true;
    const container=ref.current;
    const modulePath="/gallery.js";
    setFailed(false);
    import(/* @vite-ignore */ modulePath).then(mod=>{
      if(active && container) (view==="gallery"?mod.mountGallery:mod.mountWalkthrough)(container);
    }).catch(()=>{if(active)setFailed(true);});
    return ()=>{active=false;container?.replaceChildren();};
  },[view,attempt]);
  return <div className="media-view">{failed && <p role="status">The media viewer could not load. <button className="text-link" onClick={()=>setAttempt(a=>a+1)}>Retry</button></p>}<div ref={ref}/></div>;
}

function getView(): View {
  const hash = window.location.hash.slice(1);
  return pages.find(p=>p.id===hash)?.id || "layout";
}

export default function ProjectAtlas() {
  const [view,setView] = useState<View>("layout");
  const [floor,setFloor] = useState<Floor>("ground");
  const [selected,setSelected] = useState<number|null>(null);
  const [login,setLogin] = useState(false);
  const [menu,setMenu] = useState(false);
  const [notice,setNotice] = useState("");
  const {inventory,network,merge,refresh,user,changeUser} = useData();
  const directoryRef = useRef<HTMLDivElement>(null);
  const statuses = useMemo(()=>Object.fromEntries(Object.values(inventory).map(r=>[r.id,r.status])) as Record<number,Status>,[inventory]);
  useEffect(()=>{
    function route(){setView(getView());setMenu(false);window.scrollTo(0,0);}
    route();window.addEventListener("hashchange",route);return ()=>window.removeEventListener("hashchange",route);
  },[]);
  function changeFloor(next:Floor){if(next!==floor){setFloor(next);setSelected(null);}}
  function select(id:number) {
    const unit = plan.find(u=>u.id===id);
    if(unit){setFloor(unit.floor as Floor);setSelected(id);}
    if(window.matchMedia("(max-width: 800px)").matches && !document.querySelector("dialog[open]")) directoryRef.current?.scrollIntoView({block:"start"});
  }
  async function save(status:Status,version:number) {
    const id=selected;
    const response=await fetch("/api/shops/"+id,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status,version})});
    const data=await response.json() as {shop:Availability;error?:string};
    if(response.status===401){changeUser(null);setNotice("Your session expired. Sign in again to change shop availability.");throw new Error("Please sign in again.");}
    if(response.status===409 && data.shop){merge([data.shop]);return "This shop was changed in another session. Review its current status and try again.";}
    if(!response.ok)throw new Error(data.error || "Could not save the booking status.");
    merge([data.shop]);return unitName(id!) + " saved as " + status + ".";
  }
  async function logout(){
    try{const response=await fetch("/api/logout",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"});if(!response.ok)throw new Error();changeUser(null);setNotice("Signed out.");}
    catch{setNotice("Sign-out could not be confirmed. Please try again.");}
  }
  return <>
    <a className="skip" href="#main-content" onClick={e=>{e.preventDefault();document.getElementById("main-content")?.focus();}}>Skip to content</a>
    <header className="site-header"><div className="header-inner"><Brand/>
      <nav className={menu?"main-nav open":"main-nav"} aria-label="Project navigation">{pages.map(p=><a key={p.id} href={"#"+p.id} aria-current={view===p.id?"page":undefined} onClick={()=>setMenu(false)}>{p.label}</a>)}</nav>
      <a className="enquiry" href="tel:+919917665577">Shop enquiries</a>
      <button className="menu-toggle icon-button" onClick={()=>setMenu(!menu)} aria-expanded={menu} aria-label={menu?"Close navigation":"Open navigation"}><Icon name={menu?"close":"menu"}/></button></div></header>
    <main id="main-content" tabIndex={-1} className="page-wrap"><Hero/>
      {notice && <div role="status" className="notice">{notice}<button aria-label="Dismiss message" onClick={()=>setNotice("")}><Icon name="close" size={16}/></button></div>}
      {view==="layout" && <section className="layout-view"><div className="section-heading"><div><p className="eyebrow section-kicker"><span/>INTERACTIVE LAYOUT</p><h2>Floor plan explorer</h2><p className="intro">Select a shop to explore its dimensions and availability.</p></div><a className="outline-button download" href="/plans/naya-baazar-sizes.pdf" download><Icon name="down" size={16}/>Download plan</a></div>
        {network==="error" && <div className="offline" role="status"><Icon name="info"/><span>{Object.keys(inventory).length?"Availability could not refresh. Showing the last received update.":"Shop availability is temporarily unavailable. You can still explore the plans and dimensions."}</span><button onClick={()=>void refresh()}>Retry</button></div>}
        <div className="explorer-grid"><PlanCanvas floor={floor} onFloor={changeFloor} statuses={statuses} selected={selected} onSelect={select}/><div className="directory-wrap" ref={directoryRef}><Directory floor={floor} inventory={inventory} selected={selected} user={user} online={network==="live"} onSelect={select} onBack={()=>setSelected(null)} onSave={save}/></div></div>
      </section>}
      {view==="details" && <ProjectDetails/>}
      {(view==="gallery" || view==="walkthrough") && <MediaView view={view}/>}
    </main>
    <footer className="site-footer"><div><img src="/favicon.svg" alt="" width="24" height="24"/><span>Naya Baazar <b>·</b> Defence Garden</span></div><button className="staff-login" onClick={()=>user?void logout():setLogin(true)}><Icon name={user?"logout":"lock"} size={13}/>{user?"Staff sign out":"Staff login"}</button></footer>
    {login && <Login onClose={()=>setLogin(false)} onUser={u=>{changeUser(u);setLogin(false);window.location.hash="layout";setNotice("");window.setTimeout(()=>directoryRef.current?.scrollIntoView({block:"nearest"}),100);}}/>}
  </>;
}
