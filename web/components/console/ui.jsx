"use client";
import { useEffect, useState } from "react";
import { formatEther } from "viem";
import { EXP, S, useStore } from "./store";

export const short = (a) => (a ? a.slice(0, 6) + "…" + a.slice(-4) : "—");
export const mon = (v, d = 4) => Number(formatEther(v)).toLocaleString(undefined, { maximumFractionDigits: d });

export function Tx({ hash, children }) {
  if (!hash) return "—";
  return <a className="tx" href={`${EXP}/tx/${hash}`} target="_blank" rel="noreferrer">{children || short(hash)}</a>;
}
export function Addr({ a, children }) {
  return <a className="tx" href={`${EXP}/address/${a}`} target="_blank" rel="noreferrer">{children || short(a)}</a>;
}
export function Stat({ n, l, big = false }) {
  return (
    <div className="stat">
      <div className="n" style={big ? undefined : { fontSize: 22 }}>{n}</div>
      <div className="l">{l}</div>
    </div>
  );
}
export function Seg({ value, onChange, options, id }) {
  return (
    <div className="seg" id={id}>
      {options.map(([v, label]) => (
        <button key={v} data-v={v} className={(value === v ? "on" : "") + (value === v && v === "recall" ? " v" : "")} onClick={() => onChange(v)}>{label}</button>
      ))}
    </div>
  );
}
/** A button that shows a spinner while its async action runs. */
export function Btn({ run, busyLabel, children, className = "btn ink sm", disabled, ...rest }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      {...rest}
      className={className}
      disabled={disabled || busy}
      onClick={async (e) => {
        if (busy) return;
        setBusy(true);
        try { await run(e); } finally { setBusy(false); }
      }}
    >
      {busy ? <><span className="spin" />{busyLabel || children}</> : children}
    </button>
  );
}
export function Card({ eyebrow, title, right, className = "card", children, id }) {
  return (
    <div className={className} id={id}>
      {(eyebrow || title || right) && (
        <div className="cardhead">
          <div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}{title && <h2>{title}</h2>}</div>
          {right}
        </div>
      )}
      {children}
    </div>
  );
}
export function Toasts() {
  useStore();
  return (
    <div className="toast" id="toast">
      {S.toasts.map((t) => (
        <div key={t.id} className={t.ok ? "ok" : undefined}>
          {typeof t.body === "string" ? t.body : <>{t.body.label}: done in block {t.body.block} · <Tx hash={t.body.hash} /></>}
        </div>
      ))}
    </div>
  );
}

/** Dates render in the reader's own time zone, so they appear only after hydration. */
export function useMounted() {
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  return m;
}
export function When({ t, opts }) {
  const m = useMounted();
  if (!t) return "—";
  return m ? new Date(t).toLocaleString([], opts) : "…";
}
export const n = (x) => Number(x).toLocaleString("en-US");
