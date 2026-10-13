"use client";
import { S, BOOKS, NAME, useStore } from "./store";
import { Addr, Card, Stat, Tx, When, n } from "./ui";
import EVIDENCE from "@/data/evidence.json";
import LIVEBOOK from "@/data/live-book.json";

export function verdict(r) {
  if (r.mode === "dodge") return r.deferredCancel ? "Dodge refused: the fair take filled" : r.sniperFilled ? "Take filled" : "Maker's cancel applied";
  if (r.sniperFoundNothing) return "Sniper found nothing: the stale cancel landed first";
  if (r.sniperFilled) return "Sniper filled the stale quote";
  if (r.staleCancel) return "Cancel landed before the take";
  return "No fill";
}

export function EvidenceTable({ list }) {
  if (!list?.length) return <div className="empty">No runs yet.</div>;
  return (
    <div className="tablewrap">
      <table>
        <thead><tr><th>Book</th><th>Scenario</th><th>Move</th><th>Take (block · index)</th><th>Cancel (block · index)</th><th>Outcome</th><th>When</th></tr></thead>
        <tbody>
          {list.map((r, i) => (
            <tr key={r.take.hash + i}>
              <td><span className={"tag " + (r.cancelFirst ? "solid" : "dark")}>{r.cancelFirst ? "RECALL" : "Ordinary"}</span></td>
              <td>{r.mode === "dodge" ? "Dodge" : "Snipe · 50× fee"}</td>
              <td className="num">{r.move} bps</td>
              <td className="num"><Tx hash={r.take.hash}>#{r.take.block} · {r.take.index}</Tx></td>
              <td className="num"><Tx hash={r.cancel.hash}>#{r.cancel.block} · {r.cancel.index}</Tx></td>
              <td><span className={"tag " + (r.sniperFoundNothing || r.deferredCancel || (!r.sniperFilled && r.staleCancel) ? "ok" : "v")}>{verdict(r)}</span></td>
              <td className="num"><When t={r.when} opts={{ month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BookCard({ k }) {
  const b = S.books[k];
  if (!b?.stats) return <div className="card"><div className="empty">Loading {NAME[k]} book…</div></div>;
  const s = b.stats;
  const dark = k === "recall";
  const live = (b.orders || []).filter((o) => o.live).length;
  return (
    <div className={"card" + (dark ? " dark" : "")}>
      <div className="cardhead">
        <div><span className="eyebrow">{dark ? "Cancel-first rule on" : "Rule off"}</span><h2>{NAME[k]} book</h2></div>
        <div className="row"><span className="tag">delay {b.cfg?.delay?.toString() ?? "—"} blk</span><span className="tag">stale {b.cfg?.staleBps?.toString() ?? "—"} bps</span></div>
      </div>
      <div className="grid g4">
        <Stat big n={s.fills.toString()} l="Fills" />
        <Stat big n={s.foundNothing.toString()} l="Takes found nothing" />
        <Stat big n={s.staleCancels.toString()} l="Stale cancels won" />
        <Stat big n={s.deferred.toString()} l="Dodges deferred" />
      </div>
      <div className="grid g4" style={{ marginTop: 8 }}>
        <Stat big n={s.posts.toString()} l="Quotes posted" />
        <Stat big n={live} l="Live now" />
        <Stat big n={(b.queueLen - b.head).toString()} l="Takes waiting" />
        <Stat big n={s.cancels.toString()} l="Cancels" />
      </div>
      <div className="row" style={{ marginTop: 14, justifyContent: "space-between" }}>
        <span className="sub"><Addr a={BOOKS[k]} /></span>
        <a className="btn ghost sm" href="#trade">Trade this book</a>
      </div>
    </div>
  );
}

function LiveBook({ m }) {
  const s10 = m.staleAtFill[">=10bps"], s25 = m.staleAtFill[">=25bps"], k1 = m.makerMarkout["+1s"], k30 = m.makerMarkout["+30s"], c = m.quoteChurnSample;
  const usd = (x) => "$" + n(Math.round(x));
  const perFill = Math.round(c.ordersCreated / Math.max(c.fills, 1));
  return (
    <Card id="livebook" eyebrow={<>Measured on Monad mainnet · <When t={m.window.fromTime} /> → <When t={m.window.toTime} /></>} title="What a live ordinary book on Monad pays today">
      <div className="grid g4">
        <Stat big n={n(m.fills)} l={`fills · ${usd(m.notionalUsd)} traded`} />
        <Stat big n={(s10.shareOfFills * 100).toFixed(1) + "%"} l="filled ≥10 bps after the outside price moved through the quote" />
        <Stat big n={usd(s10.makerGaveUpUsd)} l={`given up on those ${s10.fills} fills (${s25.fills} were ≥25 bps)`} />
        <Stat big n={perFill + "×"} l={`orders posted per fill · ${n(c.cancelTransactions)} cancel txs in ${n(c.blocks)} blocks`} />
      </div>
      <p className="muted" style={{ marginTop: 14 }}>
        Every fill on a live MON/USDC order book on Monad mainnet, compared with a deep outside venue's 1-second price (median basis {m.basisBps} bps removed).
        Makers still finished {k1.netBpsOfNotional >= 0 ? "ahead" : "behind"} overall ({k1.netBpsOfNotional} bps at +1 s, {k30.netBpsOfNotional} bps at +30 s), but losing
        fills cost them {usd(k30.lossOnLosingFillsUsd)} at +30 s, and they defend by re-posting about {perFill} orders per fill. Reproduce: <code>node app/scripts/measure-live-book.mjs 24</code>.
      </p>
    </Card>
  );
}

export default function Overview() {
  useStore();
  return (
    <>
      <div className="hero">
        <span className="eyebrow">Live on Monad testnet</span>
        <h1>Two books, one contract. One lets cancels land first.</h1>
        <p>Both books below run the same code. The RECALL book holds takes for a short delay and lets a cancel overtake them only when a signed price proves the quote went stale. The ordinary book fills takes the moment they land. Every number here is read from the chain.</p>
      </div>
      <div className="grid g2" id="bookcards"><BookCard k="recall" /><BookCard k="plain" /></div>
      <Card eyebrow="Recorded races" title="The same race, both books" right={<a className="btn ghost sm" href="#race">Run it yourself</a>}>
        <div id="evidence"><EvidenceTable list={EVIDENCE} /></div>
      </Card>
      <LiveBook m={LIVEBOOK} />
    </>
  );
}
