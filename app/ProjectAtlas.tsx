"use client";

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import plan from "../src/plan-data.json";
import PlanCanvas from "./PlanCanvas";
import { MarketFacts } from "./MarketFacts";
import { ProjectDetails, MediaView } from "./ProjectFeatures";
import { Icon } from "./icons";
import ShopManager, { type BookingStatus as Status, type ShopRecord as Availability } from "./ShopManager";

const ThreePlan = lazy(() => import("./ThreePlan"));

type Floor = "ground" | "first";
type Inventory = Record<number, Availability>;
type Unit = typeof plan[number];
type User = { email: string };
type View = "home" | "layout" | "model" | "details" | "walkthrough" | "gallery";
const pages: { id: View; label: string; shortLabel: string; icon: string }[] = [
  {id:"layout", label:"Floor plans", shortLabel:"Plans", icon:"plan"},
  {id:"details", label:"Project details", shortLabel:"Project", icon:"shops"},
  {id:"walkthrough", label:"Walkthrough", shortLabel:"Walkthrough", icon:"film"},
  {id:"gallery", label:"Gallery", shortLabel:"Gallery", icon:"image"},
];
const compactLayout = "(max-width: 800px)";
const floorName = (floor: string) => floor === "ground" ? "Ground floor" : "First floor";
const unitName = (id: number) => "Shop " + String(id).padStart(2, "0");
const numberText = (feet: string) => feet.replaceAll("'", "′").replaceAll('"', "″");
const statusLabel = (s?: Status) => s === "available" ? "Available" : s === "booked" ? "Booked" : "Unconfirmed";
function Brand() {
  return <a className="brand" href="#home" aria-label="Naya Baazar home" onClick={()=>window.scrollTo(0,0)}>
    <img src="/favicon.svg" alt="" width="44" height="44"/>
    <span><strong>Naya Baazar</strong><small>By Defence Garden</small></span>
  </a>;
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
  const lastRefresh = useRef(0);
  const refresh = useCallback(async () => {
    const sequence = ++lastRefresh.current;
    try {
      const response = await fetch("/api/shops", {cache:"no-store"});
      if (!response.ok) throw new Error();
      const data = await response.json() as {shops:Availability[]};
      if (!Array.isArray(data.shops) || data.shops.length !== plan.length) throw new Error();
      merge(data.shops);
      if (sequence === lastRefresh.current) setNetwork("live");
    } catch { if (sequence === lastRefresh.current) setNetwork("error"); }
  }, [merge]);
  const [sessionReady, setSessionReady] = useState(false);
  const sessionVersion = useRef(0);
  const changeUser = useCallback((value: User|null) => { sessionVersion.current++; setUser(value); }, []);
  useEffect(() => {
    let active = true;
    let latestCheck = 0;
    async function checkSession() {
      const version = sessionVersion.current;
      const sequence = ++latestCheck;
      try {
        const response = await fetch("/api/session", {cache:"no-store"});
        if (!response.ok) return;
        const data = await response.json() as {user:User|null};
        if (active && sequence === latestCheck && sessionVersion.current === version) setUser(data.user);
      } catch {
        // Keep the current session during a transient network failure.
      } finally {
        if (active) setSessionReady(true);
      }
    }
    void checkSession();
    void refresh();
    const onFocus = () => { if (!document.hidden) { void refresh(); void checkSession(); } };
    const timer = window.setInterval(() => { if (!document.hidden) void refresh(); }, 30000);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onFocus); };
  }, [refresh]);
  return {inventory,network,merge,refresh,user,changeUser,sessionReady};
}

function Login({onClose,onUser}:{onClose:()=>void;onUser:(user:User)=>void}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [waiting,setWaiting] = useState(false);
  const [show,setShow] = useState(false);
  const [error,setError] = useState("");
  useEffect(() => {
    const el = ref.current;
    el?.showModal();
    if (window.matchMedia("(pointer: fine)").matches) el?.querySelector("input")?.focus();
    return () => el?.close();
  }, []);
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
      <form onSubmit={submit}><label>Email address<input type="email" name="email" autoComplete="username" required/></label>
      <label>Password<span className="password-box"><input type={show?"text":"password"} name="password" autoComplete="current-password" required/><button type="button" onClick={()=>setShow(!show)} aria-label={show?"Hide password":"Show password"} aria-pressed={show}><Icon name="eye"/></button></span></label>
      {error && <p className="error-text" role="alert">{error}</p>}
      <button className="primary-button" disabled={waiting}>{waiting?"Signing in…":"Sign in"}</button></form>
    </div>
  </dialog>;
}

function ShopDetails({unit,record,admin,onBack,onManage}:{unit:Unit;record?:Availability;admin:boolean;onBack?:()=>void;onManage:()=>void}) {
  return <div className="shop-details">
    {onBack && <button className="back-link" onClick={onBack}><Icon name="back" size={14}/> Shop directory</button>}
    <div className="shop-title"><h3 tabIndex={-1}>{unitName(unit.id)}</h3><span className={"status-pill "+(record?.status || "unknown")}><i/>{statusLabel(record?.status)}</span></div>
    <p className="shop-floor">{floorName(unit.floor)}</p>
    <div className="measure-heading"><Icon name="ruler" size={16}/> Internal dimensions</div>
    <dl className="measurements"><div><dt>Feet & inches</dt><dd>{numberText(unit.feet)}</dd></div><div><dt>Metres</dt><dd>{unit.metres} m</dd></div></dl>
    <p className="dimension-note">{unit.irregular ? "Irregular outline. Spans enclose the shop and include recesses." : "Approximate internal spans, short side first."}</p>
    {admin && <button type="button" className="primary-button inline-manage" onClick={onManage}><Icon name="shops" size={16}/>Update booking status</button>}
  </div>;
}

function Directory({floor,inventory,selected,user,onSelect,onBack,onManage,onClose}:{floor:Floor;inventory:Inventory;selected:number|null;user:User|null;onSelect:(id:number)=>void;onBack:()=>void;onManage:()=>void;onClose?:()=>void}) {
  const [query,setQuery] = useState("");
  const panel = useRef<HTMLElement>(null);
  const lastSelected = useRef(selected);
  const inSheet = !!onClose;
  useEffect(() => {
    if (inSheet && lastSelected.current !== selected) {
      panel.current?.querySelector<HTMLElement>(selected ? ".shop-title h3" : ".sheet-heading h2")?.focus({preventScroll:true});
    }
    lastSelected.current = selected;
  },[selected,inSheet]);
  const filtered = plan.filter(u => query.trim() ? String(u.id).includes(query.trim().replace(/^0+(?=\d)/,"")) : u.floor===floor);
  const unit = plan.find(u=>u.id===selected);
  return <aside ref={panel} className={"directory card" + (user?" staff":"")} aria-label={user?"Shop management":"Shop directory"}>
    {onClose ? <div className="sheet-heading">
      {unit ? <button className="back-link" onClick={onBack}><Icon name="back" size={16}/>Shop directory</button> : <h2 tabIndex={-1}>Shop directory</h2>}
      <button type="button" className="icon-button" aria-label="Close shop directory" onClick={onClose} autoFocus><Icon name="close"/></button>
    </div> : <div className="directory-title"><span className="panel-icon"><Icon name={user?"lock":"shops"} size={21}/></span><div><h2>{user?"Manage shops":"Shop directory"}</h2></div></div>}
    {unit ? <ShopDetails key={unit.id} unit={unit} record={inventory[unit.id]} admin={!!user} onBack={onClose ? undefined : onBack} onManage={onManage}/> : <>
      <label className="directory-search"><Icon name="search"/><input aria-label="Find shop by number" placeholder="Find shop by number" value={query} onChange={e=>setQuery(e.target.value)} inputMode="numeric"/>{query && <button type="button" aria-label="Clear search" onClick={()=>setQuery("")}><Icon name="close" size={15}/></button>}</label>
      <div className="directory-meta"><span>{query.trim()?"Search results":floorName(floor)}</span><span>{filtered.length} {filtered.length===1?"shop":"shops"}</span></div>
      <ul className="unit-list">{filtered.map(u=><li key={u.id}><button onClick={()=>onSelect(u.id)}><span className={"unit-icon "+(inventory[u.id]?.status || "unknown")}><Icon name="shops" size={17}/></span><span className="unit-info"><strong>{unitName(u.id)}</strong><small>{query.trim()?floorName(u.floor)+" · ":""}{numberText(u.feet)}</small></span><span className={"unit-status "+(inventory[u.id]?.status || "unknown")} title={statusLabel(inventory[u.id]?.status)}><i/><span className="sr">{statusLabel(inventory[u.id]?.status)}</span></span><Icon name="chevron" size={13}/></button></li>)}</ul>
      {!filtered.length && <div className="empty-list">No shop matches that number.</div>}
    </>}
  </aside>;
}

function DirectorySheet({onClose, children}:{onClose:()=>void; children:React.ReactNode}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return <dialog ref={ref} className="directory-sheet" aria-label="Shop directory and dimensions"
    onCancel={onClose} onClick={e=>{if (e.target===e.currentTarget) onClose();}}>
    {children}
  </dialog>;
}

function getView(): View {
  const hash = window.location.hash.slice(1);
  return hash.split("/")[0] === "model" ? "model" : pages.find(p=>p.id===hash)?.id || "home";
}

export default function ProjectAtlas() {
  const [view,setView] = useState<View>("home");
  const [floor,setFloor] = useState<Floor>("ground");
  const [selected,setSelected] = useState<number|null>(null);
  const [modelDirectory,setModelDirectory] = useState(false);
  const [compact,setCompact] = useState(false);
  const [directorySheet,setDirectorySheet] = useState(false);
  const [managerOpen,setManagerOpen] = useState(false);
  const [notice,setNotice] = useState("");
  const {inventory,network,merge,refresh,user,changeUser,sessionReady} = useData();
  const onHome = view === "home";
  const inLayout = onHome || view === "layout" || view === "model";
  const statuses = useMemo(()=>Object.fromEntries(Object.values(inventory).map(r=>[r.id,r.status])) as Record<number,Status>,[inventory]);
  useEffect(()=>{
    let previous: View | null = null;
    function route() {
      const next = getView();
      const switchingLayout = (next === "layout" || next === "model") && (previous === "layout" || previous === "model");
      const changedPage = previous !== next;
      previous = next;
      setView(next);
      setDirectorySheet(false);
      if (!switchingLayout || (changedPage && window.matchMedia(compactLayout).matches)) window.scrollTo(0,0);
    }
    route();window.addEventListener("hashchange",route);return ()=>window.removeEventListener("hashchange",route);
  },[]);
  useEffect(() => {
    const query = window.matchMedia(compactLayout);
    const changed = () => { setCompact(query.matches); if (!query.matches) setDirectorySheet(false); };
    changed();
    query.addEventListener("change", changed);
    return () => query.removeEventListener("change", changed);
  },[]);
  function changeFloor(next:Floor){if(next!==floor){setFloor(next);setSelected(null);}}
  function select(id:number, inspect=true) {
    const unit = plan.find(u=>u.id===id);
    if (!unit) return;
    setFloor(unit.floor as Floor);
    setSelected(id);
    if (!inspect) return;
    if (window.matchMedia(compactLayout).matches) {
      // The expanded 2D drawing already shows the selected shop inside its dialog.
      if (!document.querySelector("dialog[open]")) setDirectorySheet(true);
    } else if(view==="model") setModelDirectory(true);
  }
  async function save(id:number,status:Status,version:number) {
    const response=await fetch("/api/shops/"+id,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status,version})});
    const data=await response.json() as {shop:Availability;error?:string};
    if(response.status===401){changeUser(null);setNotice("Your session expired. Sign in again to change shop availability.");throw new Error("Please sign in again.");}
    if(response.status===409 && data.shop){merge([data.shop]);return {shop:data.shop,conflict:true};}
    if(!response.ok)throw new Error(data.error || "Could not save the booking status.");
    merge([data.shop]);return {shop:data.shop,conflict:false};
  }
  function openManagement() {
    setDirectorySheet(false);
    setManagerOpen(true);
  }
  function locateShop(id: number) {
    setManagerOpen(false);
    select(id, false);
    if(view==="model" && !window.matchMedia(compactLayout).matches) setModelDirectory(true);
    if (onHome || !inLayout) window.location.hash = "layout";
    window.requestAnimationFrame(() => document.querySelector(".explorer-grid")?.scrollIntoView({block:"start"}));
  }
  async function logout(){
    try{const response=await fetch("/api/logout",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"});if(!response.ok)throw new Error();changeUser(null);setManagerOpen(false);setNotice("Signed out.");}
    catch{setNotice("Sign-out could not be confirmed. Please try again.");}
  }
  const directoryProps = {floor, inventory, selected, user, onSelect:select, onBack:()=>setSelected(null), onManage:openManagement};
  return <>
    <a className="skip" href="#main-content" onClick={e=>{e.preventDefault();document.getElementById("main-content")?.focus();}}>Skip to content</a>
    <header className="site-header">
      <div className="header-frame">
        <div className="header-inner">
          <Brand/>
          <nav className="main-nav" aria-label="Project navigation">
            {pages.map(page => <a key={page.id} href={"#" + page.id} aria-label={page.label}
              aria-current={view === page.id || (inLayout && page.id === "layout") ? "page" : undefined}>
              <span className="mobile-nav-icon"><Icon name={page.icon} size={19}/></span>
              <span className="desktop-nav-label">{page.label}</span>
              <span className="mobile-nav-label">{page.shortLabel}</span>
            </a>)}
          </nav>
          <div className="header-actions">
            <button type="button" className="header-manage" onClick={openManagement} aria-haspopup="dialog" title="Manage shops">
              <Icon name={user ? "shops" : "lock"} size={16}/><span>Manage shops</span>
            </button>
            <a className="enquiry" href="tel:+919917665577" title="Enquire by phone">
              <span className="enquiry-label">Enquire</span>
              <span className="enquiry-icon"><Icon name="phone" size={15}/></span>
            </a>
          </div>
        </div>
      </div>
    </header>
    <main id="main-content" tabIndex={-1} className="atlas-main">
      <div className={onHome ? "page-wrap landing-page" : "page-wrap"}>
      {notice && <div role="status" className="notice">{notice}<button aria-label="Dismiss message" onClick={()=>setNotice("")}><Icon name="close" size={16}/></button></div>}
      {inLayout && <section className="layout-view" aria-labelledby="layout-heading"><div className="section-heading explorer-heading">
        <div>
          <p className="eyebrow section-kicker"><span aria-hidden="true"/>{onHome ? "Unn, Shamli" : "The shop directory"}</p>
          <h1 id="layout-heading">{view === "model" ? "Architectural model" : "Floor plan explorer"}</h1>
          <p className="intro">{view === "model" ? "Explore the courtyard and shopfronts, or select a shop for its dimensions." : "Select a shop to explore its dimensions and availability."}</p>
        </div>
        <div className="explorer-actions">
          {onHome && <a className="model-launch" href="#model">
            <span className="model-launch-icon"><Icon name="cube" size={24}/></span>
            <span>Explore 3D model</span>
          </a>}
          <nav className="mode-switch" aria-label="Layout view">
            <a href="#layout" aria-current={view!=="model"?"page":undefined}><Icon name="grid" size={16}/>2D plan</a>
            {!onHome && <a href="#model" aria-current={view==="model"?"page":undefined}><Icon name="cube" size={17}/>3D model</a>}
          </nav>
          <a className="outline-button download" aria-label="Download floor plan PDF" href="/plans/naya-baazar-sizes.pdf" download>
            <Icon name="down" size={16}/><span className="download-full">Download plan</span><span className="download-short">PDF</span>
          </a>
        </div>
      </div>
        {network==="error" && <div className="offline" role="status"><Icon name="info"/><span>{Object.keys(inventory).length?"Availability could not refresh. Showing the last received update.":"Shop availability is temporarily unavailable. You can still explore the plans and dimensions."}</span><button onClick={()=>void refresh()}>Retry</button></div>}
        <div className={"explorer-grid" + (view==="model" && !modelDirectory?" model-wide":"")}>
          {view === "model"
            ? <Suspense fallback={<div className="model-loading" role="status">Loading 3D model…</div>}>
                <ThreePlan directoryOpen={modelDirectory} onToggleDirectory={()=>setModelDirectory(open=>!open)} onClearSelection={()=>setSelected(null)} floor={floor} onFloor={changeFloor} statuses={statuses} selected={selected} onSelect={select}/>
              </Suspense>
            : <PlanCanvas floor={floor} onFloor={changeFloor} statuses={statuses} selected={selected} onSelect={select}/>}
          <div id="layout-directory" className="directory-wrap" hidden={view==="model" && !modelDirectory}>
            {!compact && (view!=="model" || modelDirectory) && <Directory {...directoryProps}/>}
          </div>
        </div>
        <button type="button" className="mobile-shop-search" aria-haspopup="dialog" onClick={()=>{setSelected(null);setDirectorySheet(true);}}>
          <Icon name="search" size={20}/>Find a shop by number<Icon name="chevron" size={16}/>
        </button>
        {directorySheet && <DirectorySheet onClose={()=>setDirectorySheet(false)}>
          <Directory {...directoryProps} onClose={()=>setDirectorySheet(false)}/>
        </DirectorySheet>}
      </section>}
      {view==="details" && <ProjectDetails/>}
      {(view==="gallery" || view==="walkthrough") && <MediaView view={view}/>}
      </div>
      {onHome && <MarketFacts shopCount={plan.length}/>}
    </main>
    <footer className="site-footer"><div><img src="/favicon.svg" alt="" width="24" height="24"/><span>Naya Baazar <b>·</b> Defence Garden</span></div><button className="staff-login" onClick={()=>user?void logout():openManagement()}><Icon name={user?"logout":"lock"} size={13}/>{user?"Staff sign out":"Staff login"}</button></footer>
    {managerOpen && !sessionReady && <div className="session-loading" role="status">Checking staff session…</div>}
    {managerOpen && sessionReady && (user
      ? <ShopManager initialId={selected ?? (floor === "ground" ? 1 : 112)} records={inventory} network={network} onSave={save} onRefresh={()=>void refresh()} onClose={()=>setManagerOpen(false)} onLocate={locateShop}/>
      : <Login onClose={()=>setManagerOpen(false)} onUser={u=>{changeUser(u);setNotice("");void refresh();}}/>)}
  </>;
}
