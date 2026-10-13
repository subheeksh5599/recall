"use client";
import { useEffect, useState } from "react";
import { S, boot, connect, useStore } from "./store";
import { Toasts, short } from "./ui";
import { fmtPrice } from "@/lib/chain.js";
import Overview from "./Overview";
import Trade from "./Trade";
import RaceLab from "./RaceLab";
import Activity from "./Activity";
import Contracts from "./Contracts";

const VIEWS = { overview: ["Overview", Overview], trade: ["Trade", Trade], race: ["Race Lab", RaceLab], activity: ["Activity", Activity], contracts: ["Contracts", Contracts] };

function useHashView() {
  const read = () => {
    const v = (typeof location === "undefined" ? "" : location.hash).slice(1);
    return VIEWS[v] ? v : "overview";
  };
  const [view, setView] = useState("overview");
  useEffect(() => {
    const on = () => setView(read());
    on();
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return view;
}

const I = {
  overview: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="13" y="3" width="8" height="5" rx="1.5" /><rect x="13" y="10" width="8" height="11" rx="1.5" /><rect x="3" y="13" width="8" height="8" rx="1.5" /></svg>,
  trade: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M4 7h11M4 12h16M4 17h8" /><path d="M15 4l3 3-3 3" /></svg>,
  race: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M4 18 12 4l8 14Z" /><path d="M12 10v4" /></svg>,
  activity: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M5 19V9M10 19V5M15 19v-8M20 19v-4" /></svg>,
  contracts: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5M10 13h6M10 17h6" /></svg>,
  out: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M10 6H5v13h13v-5" /><path d="M14 4h6v6M20 4l-9 9" /></svg>,
};

function useNow(ms) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export default function Console() {
  useStore();
  const view = useHashView();
  const [open, setOpen] = useState(false);
  const now = useNow(1000);
  useEffect(() => { boot(); }, []);
  useEffect(() => setOpen(false), [view]);

  const age = S.price && now ? Math.max(0, Math.round((now - S.price.timestampMs) / 1000)) : null;
  const price = S.price ? "$" + fmtPrice(S.price.median) : "—";
  const [title, View] = VIEWS[view];
  const link = (v) => (
    <a href={"#" + v} className={view === v ? "active" : undefined}>{I[v]}{VIEWS[v][0]}</a>
  );

  return (
    <>
      <div className="shell">
        <aside className={"side" + (open ? " open" : "")} id="side">
          <a className="brand" href="/">
            <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="6" fill="#e42b0c" /><rect x="5" y="6" width="9" height="3" rx="1.5" fill="#fff" /><rect x="5" y="15" width="14" height="3" rx="1.5" fill="#fff" opacity=".55" /><path d="M15.5 7.5h3.5v5" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <b>RECALL</b><small>Testnet</small>
          </a>
          <div className="navgroup">Console</div>
          <nav className="nav">{link("overview")}{link("trade")}{link("race")}</nav>
          <div className="navgroup">Record</div>
          <nav className="nav">
            {link("activity")}{link("contracts")}
            <a href="/">{I.out}Landing page</a>
          </nav>
          <div className="side-foot">
            <div className="netcard">
              <div className="row"><span><i className={"dot " + (S.block ? "live" : "bad")} />Monad testnet</span><span className="mono" id="blockno">{S.block ? "#" + Number(S.block).toLocaleString("en-US") : "—"}</span></div>
              <div className="row"><span>Signed price</span><span className="mono">{price}</span></div>
              <div className="row"><span>Price age</span><span className="mono">{age === null ? "—" : age + "s"}</span></div>
            </div>
            <button className="btn fire" id="connect" onClick={connect}>{S.wallet ? short(S.wallet.address) : "Connect wallet"}</button>
          </div>
        </aside>

        <div className="main">
          <header className="top">
            <button className="burger" aria-label="Open menu" onClick={() => setOpen((o) => !o)}>☰</button>
            <div className="crumb">Console / <b>{title}</b></div>
            <div className="spacer" />
            <div className="pricechip">
              <span className="eyebrow">MON / USD</span><span className="v" id="topprice">{price}</span>
              <span className="tag">{S.price ? `${S.price.packages.length} signers · ${age ?? 0}s` : S.priceErr ? "price unavailable" : "—"}</span>
            </div>
            {S.wallet && <div className="pricechip"><span className="eyebrow">You</span><span className="v">{short(S.wallet.address)}</span></div>}
          </header>
          <section className="view active" id={"view-" + view}>
            <View />
          </section>
        </div>
      </div>
      <Toasts />
    </>
  );
}
