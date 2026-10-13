"use client";
import { useState } from "react";
import { fmtPrice } from "@/lib/chain.js";
import { S, NAME, useStore } from "./store";
import { Addr, Card, Seg, Tx, mon } from "./ui";

const EV_TEXT = {
  Posted: (a) => `Quote #${a.id} ${a.isAsk ? "ask" : "bid"} ${mon(BigInt(a.size))} MON at $${fmtPrice(BigInt(a.price))}`,
  TakeQueued: (a) => `Take #${a.takeIndex} on quote #${a.orderId}, ${mon(BigInt(a.size))} MON`,
  Filled: (a) => `Take #${a.takeIndex} filled ${mon(BigInt(a.size))} MON on #${a.orderId}`,
  FoundNothing: (a) => `Take #${a.takeIndex} found nothing on #${a.orderId}, refunded`,
  Cancelled: (a) => (a.stale ? `Quote #${a.id} pulled with stale proof (${a.moveBps} bps)` : `Quote #${a.id} cancelled`),
  CancelDeferred: (a) => `Cancel on #${a.id} waits behind the take (${a.moveBps} bps, below threshold)`,
  CancelTooLate: (a) => `Cancel on #${a.id} arrived after the fill`,
};

export default function Activity() {
  useStore();
  const [k, setK] = useState("recall");
  const b = S.books[k];
  const from = S.scanFrom > 1n ? S.scanFrom - 1n : 0n;
  return (
    <>
      <Card eyebrow="Live tail" title="Book events" right={<span className="tag">from #{from.toString()} · {S.events.length} events</span>}>
        <div id="eventtable">
          {S.events.length ? (
            <div className="tablewrap">
              <table>
                <thead><tr><th>Block · index</th><th>Book</th><th>Event</th><th>What happened</th><th>Tx</th></tr></thead>
                <tbody>
                  {S.events.slice(0, 120).map((e) => (
                    <tr key={e.key}>
                      <td className="num">#{e.block} · {e.index}</td>
                      <td><span className={"tag " + (e.book === "recall" ? "solid" : "dark")}>{NAME[e.book]}</span></td>
                      <td className="mono">{e.name}</td>
                      <td>{(EV_TEXT[e.name] || (() => ""))(e.args)}</td>
                      <td><Tx hash={e.tx} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div className="empty">Waiting for book events. Post, take or run a race and they appear here within a few seconds.</div>}
        </div>
        <p className="note" style={{ marginTop: 12 }}>The public RPC serves logs 100 blocks at a time, so this feed tails the chain from the moment the page opened and keeps what it has seen in this browser.</p>
      </Card>
      <Card eyebrow="From contract state" title="Every take ever queued" right={<Seg value={k} onChange={setK} options={[["recall", "RECALL"], ["plain", "Ordinary"]]} />}>
        <div id="taketable">
          {!b?.takes ? <div className="empty">Loading…</div> : b.takes.length ? (
            <div className="tablewrap">
              <table>
                <thead><tr><th>Take</th><th>Quote</th><th>Taker</th><th>Size (MON)</th><th>Queued in</th><th>State</th></tr></thead>
                <tbody>
                  {b.takes.map((t) => (
                    <tr key={t.index.toString()}>
                      <td className="num">#{t.index.toString()}</td>
                      <td className="num">#{t.orderId.toString()}</td>
                      <td><Addr a={t.taker} /></td>
                      <td className="num">{mon(t.size)}</td>
                      <td className="num">#{t.blockNumber.toString()}</td>
                      <td>{t.index >= b.head ? <span className="tag v">waiting</span> : <span className="tag">settled</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div className="empty">No takes on this book yet.</div>}
        </div>
      </Card>
    </>
  );
}
