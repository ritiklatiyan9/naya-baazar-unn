import type { ReactNode } from "react";

const symbols: Record<string, ReactNode> = {
  phone: <path d="M7 3H4a1 1 0 0 0-1 1c0 9.4 7.6 17 17 17a1 1 0 0 0 1-1v-3l-5-2-2 2a14 14 0 0 1-7-7l2-2z"/>,
  plan: <><path d="m3 8 9-5 9 5-9 5z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/></>,
  pin: <><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.6"/></>,
  down: <><path d="M12 3v12m-4-4 4 4 4-4M4 16v4h16v-4"/></>,
  shops: <><path d="M3 10 5 4h14l2 6M4 10h16v10H4zM8 20v-5h4v5M3 10q2 5 4.5 0 2.2 5 4.5 0 2.2 5 4.5 0Q19 15 21 10"/></>,
  search: <><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/></>,
  close: <path d="m6 6 12 12M18 6 6 18"/>,
  lock: <><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 1 1 8 0v3"/></>,
  cube: <><path d="m12 2 9 5v10l-9 5-9-5V7z"/><path d="m3 7 9 5 9-5m-9 5v10"/></>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
  film: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m10 9 5 3-5 3z"/></>,
  image: <><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8" cy="9" r="1.4"/><path d="m4 17 5-5 4 4 3-3 5 5"/></>,
  chevron: <path d="m9 5 7 7-7 7"/>,
  back: <path d="m14.5 5-7 7 7 7"/>,
  check: <path d="m4 12 5 5L20 6"/>,
  ruler: <><path d="m3 16 13-13 5 5L8 21zM13 6l2.5 2.5M10 9l2 2M7 12l2.5 2.5"/></>,
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></>,
  menu: <path d="M3 6h18M3 12h18M3 18h18"/>,
  leaf: <><path d="M19 3c1 10-2 16-9 16-4 0-7-4-5-8 2-4 7-6 14-8Z"/><path d="M4 21 15 9"/></>,
  logout: <><path d="M9 4H4v16h5M8 12h12m-4-4 4 4-4 4"/></>,
  info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-9v.5"/></>,
};
export function Icon({name,size=18}:{name:string;size?:number}) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">{symbols[name]}</svg>;
}
