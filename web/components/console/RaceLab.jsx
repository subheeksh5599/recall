"use client";
import { useState } from "react";
import { parseEther } from "viem";
import { ADDR, erc20Abi, fmtPrice } from "@/lib/chain.js";
import { prepare, race, send, wait } from "@/lib/race.js";
import { S, BOOKS, errMsg, loadBalances, loadBooks, loadBurners, need, pc, saveRace, toast, useStore, act } from "./store";
import { Addr, Btn, Seg, Tx, mon } from "./ui";
import { EvidenceTable, verdict } from "./Overview";
import { monadTestnet } from "@/lib/chain.js";

const STEP_TEXT = {
  price: (s) => `Signed price ${fmtPrice(BigInt(s.price))} fetched`,
  posted: (s) => `Maker posted ask #${s.askId} and bid #${s.bidId} at that price`,
  watch: (s) => `Watching: ${s.move} bps from the posted price`,
  stale: (s) => `Quote #${s.target} is ${s.move} bps off. Firing both transactions`,
  fired: () => `Sniper take sent at 50× priority, maker cancel at 1×`,
  landed: (s) => `Take landed in #${s.take.block} at index ${s.take.index} (${s.take.events.join(", ")}). Cancel in #${s.cancel.block} at index ${s.cancel.index} (${s.cancel.events.join(", ")})`,
};

function Burners() {
  const [fund, setFund] = useState("0.5");
  if (!S.burn) return <div className="card stack" id="burnercard"><div className="empty">Loading…</div></div>;
  const low = ["maker", "sniper"].some((r) => !S.burnBal[r] || S.burnBal[r].mon < parseEther("0.2"));
  const row = (r) => {
    const b = S.burnBal[r] || {};
    return (
      <div className="lane" key={r}>
        <div><span className="eyebrow">{r}</span><div><Addr a={S.burn[r].address} /></div></div>
        <div className="row mono" style={{ fontSize: 13, justifyContent: "flex-end" }}>
          {b.mon !== undefined ? <>{mon(b.mon, 3)} MON · {mon(b.wmon, 2)} WMON · {mon(b.usd, 2)} tUSD {b.approved ? <span className="tag ok">ready</span> : <span className="tag">not ready</span>}</> : "…"}
        </div>
      </div>
    );
  };
  const backup = () => {
    const blob = new Blob([localStorage.getItem("recall.burners")], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "recall-race-wallets.json";
    a.click();
  };
  const doFund = async () => {
    if (!need()) return;
    for (const r of ["maker", "sniper"]) {
      await act(`Fund ${r}`, () => S.wallet.wc.sendTransaction({ account: S.wallet.address, to: S.burn[r].address, value: parseEther(fund || "0.5"), chain: monadTestnet }));
    }
    await loadBurners();
  };
  const doPrepare = async () => {
    try {
      await prepare(pc, S.bw.maker, { wmon: parseEther("0.25") });
      await prepare(pc, S.bw.sniper, { wmon: parseEther("0.25") });
      toast("Race wallets ready.", true);
    } catch (err) { toast(errMsg(err)); }
    await loadBurners();
  };
  const sweep = async () => {
    if (!need()) return;
    try {
      for (const r of ["maker", "sniper"]) {
        const wc = S.bw[r];
        const addr = S.burn[r].address;
        const wb = await pc.readContract({ address: ADDR.wmon, abi: erc20Abi, functionName: "balanceOf", args: [addr] });
        if (wb > 0n) await wait(pc, await send(pc, wc, { address: ADDR.wmon, abi: erc20Abi, functionName: "withdraw", args: [wb] }));
        const bal = await pc.getBalance({ address: addr });
        const gp = (await pc.getBlock()).baseFeePerGas * 2n;
        const keep = gp * 21000n + parseEther("0.002");
        if (bal > keep) await wait(pc, await wc.sendTransaction({ to: S.wallet.address, value: bal - keep, gas: 21000n, maxFeePerGas: gp, maxPriorityFeePerGas: 1n, chain: monadTestnet }));
      }
      toast("Swept back to your wallet.", true);
    } catch (err) { toast(errMsg(err)); }
    await Promise.all([loadBurners(), loadBalances()]);
  };
  return (
    <div className="card stack" id="burnercard">
      <div><span className="eyebrow">Race wallets · this browser only</span><h2>Maker and sniper</h2></div>
      <div>{row("maker")}{row("sniper")}</div>
      <div className="row">
        <input className="input mono" value={fund} onChange={(e) => setFund(e.target.value)} style={{ width: 70, padding: "6px 8px", fontSize: 13 }} />
        <Btn className={"btn " + (low ? "v" : "ghost") + " sm"} id="fundb" busyLabel="Funding" run={doFund}>Fund both (MON each)</Btn>
        <Btn className="btn ghost sm" id="prepb" busyLabel="Preparing" run={doPrepare}>Prepare</Btn>
        <Btn className="btn ghost sm" id="sweepb" busyLabel="Sweeping" run={sweep}>Sweep back</Btn>
        <button className="btn ghost sm" id="backupb" onClick={backup}>Back up keys</button>
      </div>
      <p className="note">Funding sends MON from your connected wallet. Prepare wraps a little MON, claims tUSD and approves the books for each race wallet. Sweep returns what's left to you. The keys live only in this browser's storage: back them up or sweep before clearing it.</p>
    </div>
  );
}

function Result({ r }) {
  const won = r.mode === "dodge" ? r.deferredCancel : r.sniperFoundNothing;
  return (
    <div className="card">
      <div className="verdict" style={{ borderColor: won ? "#22c55e" : "var(--v)" }}>
        <span className="eyebrow">{r.cancelFirst ? "RECALL book" : "Ordinary book"} · {r.mode === "dodge" ? "dodge" : "snipe"} · {r.move} bps move</span>
        <h3 style={{ marginTop: 6 }}>{verdict(r)}</h3>
        <div className="grid g2" style={{ marginTop: 14 }}>
          <div className="stat"><div className="l">Sniper take</div><div className="mono" style={{ marginTop: 6 }}><Tx hash={r.take.hash} /> · block #{String(r.take.block)} · index {r.take.index}</div></div>
          <div className="stat"><div className="l">Maker cancel</div><div className="mono" style={{ marginTop: 6 }}><Tx hash={r.cancel.hash} /> · block #{String(r.cancel.block)} · index {r.cancel.index}</div></div>
        </div>
        <p className="note" style={{ marginTop: 12 }}>
          {r.cancelFirst
            ? (r.mode === "dodge" ? "The cancel carried no stale proof, so it was applied after the waiting take settled." : "The take was queued for the delay. The cancel carried a signed price past the threshold, so it removed the quote first and the take was refunded.")
            : "On the ordinary book the take filled in the transaction that carried it. The cancel arrived to a filled order."}
          {r.settle && <> Settlement: <Tx hash={r.settle} />.</>}
        </p>
      </div>
    </div>
  );
}

export default function RaceLab() {
  useStore();
  const [book, setBook] = useState("recall");
  const [mode, setMode] = useState("snipe");
  const [size, setSize] = useState("0.2");
  const [steps, setSteps] = useState([]);
  const [move, setMove] = useState(null);
  const [result, setResult] = useState(null);
  const [racing, setRacing] = useState(false);
  const stale = S.books[book]?.cfg ? Number(S.books[book].cfg.staleBps) : null;

  const run = async () => {
    if (racing) return;
    const ready = ["maker", "sniper"].every((r) => S.burnBal[r]?.approved && S.burnBal[r]?.mon > parseEther("0.15"));
    if (!ready) return toast("Fund and prepare the race wallets first.");
    setRacing(true);
    setSteps([]);
    setResult(null);
    setMove(0);
    const add = (text, small, done = true) => setSteps((st) => {
      const next = st.length && st[st.length - 1].watch && text.startsWith("Watching") ? st.slice(0, -1) : st;
      return [...next, { text, small, done, watch: text.startsWith("Watching") }];
    });
    try {
      const r = await race(pc, {
        maker: S.bw.maker, sniper: S.bw.sniper, book: BOOKS[book], mode,
        size: parseEther(size || "0.2"), signers: S.signers,
        onStep: (s) => {
          if (s.k === "watch" || s.k === "stale") setMove(s.move);
          if (s.k === "result") return;
          const small = s.k === "posted" ? s.hashes.map((h) => <Tx key={h} hash={h} />) : s.k === "fired" ? <><Tx hash={s.take}>take</Tx> · <Tx hash={s.cancel}>cancel</Tx></> : null;
          add((STEP_TEXT[s.k] || (() => s.k))(s), small, s.k !== "watch");
        },
      });
      r.when = Date.now();
      setResult(r);
      saveRace(r);
    } catch (err) {
      add("Stopped: " + errMsg(err));
      toast(errMsg(err));
    }
    setRacing(false);
    await Promise.all([loadBurners(), loadBooks()]);
  };

  const pct = stale && move !== null ? Math.min(100, (move / (stale * 2)) * 100) : 0;
  return (
    <>
      <div className="hero">
        <span className="eyebrow">Race Lab</span>
        <h1>Snipe your own quote and watch who wins.</h1>
        <p>Two throwaway testnet wallets live in this browser: a maker and a sniper. The maker quotes at the signed price. When the real price moves past the stale threshold, the sniper sends a take with 50× the priority fee and the maker sends an ordinary cancel at the same instant. Run it on both books and compare the blocks.</p>
      </div>
      <div className="grid g3">
        <Burners />
        <div className="card stack">
          <div><span className="eyebrow">Setup</span><h2>Race settings</h2></div>
          <div className="field"><label>Book</label><Seg id="racebook" value={book} onChange={setBook} options={[["recall", "RECALL"], ["plain", "Ordinary"]]} /></div>
          <div className="field"><label>Scenario</label><Seg id="racemode" value={mode} onChange={setMode} options={[["snipe", "Snipe after a real move"], ["dodge", "Maker dodges a fair take"]]} /></div>
          <div className="field"><label>Size (MON)</label><input className="input mono" id="racesize" value={size} onChange={(e) => setSize(e.target.value)} /></div>
          <button className="btn fire" id="racebtn" disabled={racing} onClick={run}>{racing ? <><span className="spin" />Racing</> : "Run the race"}</button>
          <p className="note">{mode === "snipe"
            ? "Snipe waits for a real signed-price move of at least the book's threshold. Nothing is simulated."
            : "Dodge: the sniper wallet takes as a fair buyer while the price is flat, and the maker tries to cancel against it."}</p>
        </div>
        <div className="card dark stack">
          <div><span className="eyebrow">Signed price vs posted</span><h2>{move === null ? "—" : `${move.toFixed(2)} bps`}</h2></div>
          <div className="meter"><i style={{ width: pct + "%" }} /><b style={{ left: "50%" }} /></div>
          <div className="row" style={{ justifyContent: "space-between" }}><span className="sub">0 bps</span><span className="sub">stale at {stale ?? "—"} bps</span></div>
          <div className="timeline" id="timeline">
            {steps.length ? steps.map((s, i) => (
              <div key={i} className={"st" + (s.done ? " done" : "")}><span>{s.text}</span>{s.small && <small>{s.small}</small>}</div>
            )) : <div className="st"><span>Waiting to start.</span></div>}
          </div>
        </div>
      </div>
      <div id="raceresult">{result && <Result r={result} />}</div>
      <div className="card">
        <div className="cardhead"><div><span className="eyebrow">Your runs</span><h2>Race history</h2></div></div>
        <div id="racehistory"><EvidenceTable list={S.races} /></div>
      </div>
    </>
  );
}
