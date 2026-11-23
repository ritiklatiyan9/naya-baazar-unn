"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import plan from "../src/plan-data.json";
import { Icon } from "./icons";

export type BookingStatus = "available" | "booked";
export type ShopRecord = { id: number; status: BookingStatus; version: number };
type SaveResult = { shop: ShopRecord; conflict: boolean };
type Props = {
  initialId: number;
  records: Record<number, ShopRecord>;
  network: "loading" | "live" | "error";
  onSave: (id: number, status: BookingStatus, version: number) => Promise<SaveResult>;
  onLocate: (id: number) => void;
  onClose: () => void;
  onRefresh: () => void;
};

const nameOf = (status: BookingStatus) => status === "available" ? "Available" : "Booked";

function StatusEditor({ record, online, save }: {
  record: ShopRecord;
  online: boolean;
  save: Props["onSave"];
}) {
  const [draft, setDraft] = useState<{ status: BookingStatus; version: number } | null>(null);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState("");
  const status = draft?.status ?? record.status;
  const changed = status !== record.status;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft || !changed || pending || !online) return;
    setPending(true);
    setFeedback("");
    try {
      const result = await save(record.id, draft.status, draft.version);
      setDraft(null);
      setFeedback(result.conflict
        ? "Another session changed this shop. Review its current status before saving again."
        : "Shop " + record.id + " saved as " + result.shop.status + ".");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Could not save this update. Please retry.");
    } finally {
      setPending(false);
    }
  }

  return <form className="booking-form" onSubmit={submit}>
    <fieldset disabled={pending || !online}>
      <legend>Booking status</legend>
      {(["available", "booked"] as const).map(option => <label key={option} className={"booking-option " + option}>
        <input type="radio" name="shop-booking-status" value={option} checked={status === option}
          onChange={() => { setDraft({status:option, version:draft?.version ?? record.version}); setFeedback(""); }}/>
        <i aria-hidden="true"/><span>{nameOf(option)}</span>
      </label>)}
    </fieldset>
    <button className="primary-button booking-save" type="submit" disabled={!online || !changed || pending}>
      <Icon name="check" size={17}/>{pending ? "Saving…" : "Save status"}
    </button>
    <p className="booking-feedback" role="status">{feedback}</p>
  </form>;
}

export default function ShopManager({initialId, records, network, onSave, onLocate, onClose, onRefresh}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const [number, setNumber] = useState(String(initialId));
  const unit = plan.find(item => String(item.id) === number.trim().replace(/^0+(?=\d)/,""));
  const record = unit ? records[unit.id] : undefined;

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    if (matchMedia("(pointer: coarse)").matches) heading.current?.focus();
    else search.current?.focus();
    return () => element?.close();
  }, []);

  return <dialog className="manager-dialog" ref={dialog} aria-labelledby="manager-heading"
    onCancel={onClose} onClick={event => { if(event.target === event.currentTarget) onClose(); }}>
    <div className="manager-content">
      <header className="manager-heading"><span className="eyebrow">STAFF WORKSPACE</span>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close shop management"><Icon name="close"/></button>
        <h2 id="manager-heading" tabIndex={-1} ref={heading}>Manage shops</h2>
      </header>
      <label className="manager-input">Shop number
        <span><Icon name="search" size={17}/><input type="text" inputMode="numeric" list="manager-shop-numbers" value={number}
          autoComplete="off" ref={search} onFocus={event => event.target.select()} onChange={event => setNumber(event.target.value)}
          placeholder="Enter a shop number"/></span>
      </label>
      <datalist id="manager-shop-numbers">{plan.map(item => <option key={item.id} value={String(item.id)}>
        {item.floor === "ground" ? "Ground floor" : "First floor"}
      </option>)}</datalist>
      {unit ? <>
        <div className="manager-unit"><span className="panel-icon"><Icon name="shops" size={23}/></span><div>
          <h3>Shop {String(unit.id).padStart(2,"0")}</h3>
          <p>{unit.floor === "ground" ? "Ground floor" : "First floor"} · {unit.feet.replaceAll("'","′").replaceAll('"',"″")}</p>
        </div></div>
        {record && <StatusEditor key={unit.id} record={record} online={network === "live"} save={onSave}/>}
        {network === "loading" && !record && <p role="status">Loading booking status…</p>}
        <button type="button" className="locate-shop" onClick={() => onLocate(unit.id)}><Icon name="pin" size={16}/>Show shop on layout</button>
      </> : <p className="manager-help" role="status">{number.trim() ? "This number is missing from the project register." : "Enter a shop number to update its booking status."} Ground floor 1–108 · First floor 112–219.</p>}
      {network === "error" && <div className="offline" role="status">Booking data could not refresh.<button onClick={onRefresh}>Retry</button></div>}
    </div>
  </dialog>;
}
