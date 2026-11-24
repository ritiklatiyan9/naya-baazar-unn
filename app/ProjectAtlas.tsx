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

function ShopSheet({unit,record,admin,onClose,onManage}:{unit:Unit;record?:Availability;admin:boolean;onClose:()=>void;onManage:()=>void}) {
  const panel = useRef<HTMLElement>(null);
  useEffect(() => { panel.current?.querySelector<HTMLElement>(".shop-title h3")?.focus({preventScroll:true}); },[unit.id]);
  useEffect(() => {
    const key = (e:KeyboardEvent) => { if (e.key === "Escape" && !document.querySelector("dialog[open]")) onClose(); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  },[onClose]);
  return <aside ref={panel} className="shop-sheet card" aria-label="Shop details">
    <button type="button" className="icon-button shop-sheet-close" aria-label="Close shop details" onClick={onClose}><Icon name="close"/></button>
    <ShopDetails key={unit.id} unit={unit} record={record} admin={admin} onManage={onManage}/>
  </aside>;
}

function getView(): View {
  const hash = window.location.hash.slice(1);
  return hash.split("/")[0] === "model" ? "model" : pages.find(p=>p.id===hash)?.id || "home";
}

export default function ProjectAtlas() {
  const [view,setView] = useState<View>("home");
  const [floor,setFloor] = useState<Floor>("ground");
  const [selected,setSelected] = useState<number|null>(null);
  const [managerOpen,setManagerOpen] = useState(false);
  const [notice,setNotice] = useState("");
  const {inventory,network,merge,refresh,user,changeUser,sessionReady} = useData();
  const onHome = view === "home";
  const inLayout = onHome || view === "layout" || view === "model"; // plan pages: round 3D/2D dock, shop details in a side sheet
  const sheetUnit = inLayout ? plan.find(u=>u.id===selected) : undefined;
  const statuses = useMemo(()=>Object.fromEntries(Object.values(inventory).map(r=>[r.id,r.status])) as Record<number,Status>,[inventory]);
  useEffect(()=>{
    let previous: View | null = null;
    function route() {
      const next = getView();
      const switchingLayout = (next === "layout" || next === "model") && (previous === "layout" || previous === "model");
      const changedPage = previous !== next;
      previous = next;
      setView(next);
      if (!switchingLayout || (changedPage && window.matchMedia(compactLayout).matches)) window.scrollTo(0,0);
    }
    route();window.addEventListener("hashchange",route);return ()=>window.removeEventListener("hashchange",route);
  },[]);
  function changeFloor(next:Floor){if(next!==floor){setFloor(next);setSelected(null);}}
  function select(id:number) {
    const unit = plan.find(u=>u.id===id);
    if (!unit) return;
    setFloor(unit.floor as Floor);
    setSelected(id);
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
    setManagerOpen(true);
  }
  function locateShop(id: number) {
    setManagerOpen(false);
    select(id);
    if (onHome || !inLayout) window.location.hash = "layout";
    window.requestAnimationFrame(() => document.querySelector(".explorer-grid")?.scrollIntoView({block:"start"}));
  }
  async function logout(){
    try{const response=await fetch("/api/logout",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"});if(!response.ok)throw new Error();changeUser(null);setManagerOpen(false);setNotice("Signed out.");}
    catch{setNotice("Sign-out could not be confirmed. Please try again.");}
  }
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
      <div className={inLayout ? "page-wrap landing-page" + (sheetUnit ? " sheet-open" : "") : "page-wrap"}>
      {notice && <div role="status" className="notice">{notice}<button aria-label="Dismiss message" onClick={()=>setNotice("")}><Icon name="close" size={16}/></button></div>}
      {inLayout && <section className="layout-view" aria-labelledby="layout-heading"><div className="section-heading explorer-heading">
        <h1 id="layout-heading" className="sr">{view === "model" ? "Architectural model" : "Floor plan explorer"}</h1>
        <div className="explorer-actions">
          <a className="model-launch" href="#model" aria-current={view==="model"?"page":undefined} aria-label="Explore 3D model" title="Explore 3D model">3D</a>
          <nav className="mode-switch" aria-label="Layout view">
            <a href="#layout" aria-current={view!=="model"?"page":undefined} aria-label="2D plan" title="2D plan">2D</a>
          </nav>
        </div>
      </div>
        {network==="error" && Object.keys(inventory).length>0 && <div className="offline" role="status"><Icon name="info"/><span>Availability could not refresh. Showing the last received update.</span><button onClick={()=>void refresh()}>Retry</button></div>}
        <div className="explorer-grid">
          {view === "model"
            ? <Suspense fallback={<div className="model-loading" role="status">Loading 3D model…</div>}>
                <ThreePlan onClearSelection={()=>setSelected(null)} floor={floor} onFloor={changeFloor} statuses={statuses} selected={selected} onSelect={select}/>
              </Suspense>
            : <PlanCanvas floor={floor} onFloor={changeFloor} statuses={statuses} selected={selected} onSelect={select}/>}
        </div>
      </section>}
      {view==="details" && <ProjectDetails/>}
      {(view==="gallery" || view==="walkthrough") && <MediaView view={view}/>}
      </div>
      {onHome && <MarketFacts shopCount={plan.length}/>}
      {sheetUnit && <ShopSheet unit={sheetUnit} record={inventory[sheetUnit.id]} admin={!!user} onClose={()=>setSelected(null)} onManage={openManagement}/>}
    </main>
    <footer className="site-footer"><div><img src="/favicon.svg" alt="" width="24" height="24"/><span>Naya Baazar <b>·</b> Defence Garden</span></div><button className="staff-login" onClick={()=>user?void logout():openManagement()}><Icon name={user?"logout":"lock"} size={13}/>{user?"Staff sign out":"Staff login"}</button></footer>
    {managerOpen && !sessionReady && <div className="session-loading" role="status">Checking staff session…</div>}
    {managerOpen && sessionReady && (user
      ? <ShopManager initialId={selected ?? (floor === "ground" ? 1 : 112)} records={inventory} network={network} onSave={save} onRefresh={()=>void refresh()} onClose={()=>setManagerOpen(false)} onLocate={locateShop}/>
      : <Login onClose={()=>setManagerOpen(false)} onUser={u=>{changeUser(u);setNotice("");void refresh();}}/>)}
  </>;
}
