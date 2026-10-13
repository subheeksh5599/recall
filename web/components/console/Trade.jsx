"use client";
import { useEffect, useState } from "react";
import { formatEther, parseEther } from "viem";
import { ADDR, bookAbi, erc20Abi, fetchSignedPrice, fmtPrice, moveBps } from "@/lib/chain.js";
import { S, BOOKS, NAME, act, connect, need, pc, useStore, w } from "./store";
import { Addr, Btn, Card, Seg, Stat, mon, short } from "./ui";

const BOOK_OPTS = [["recall", "RECALL"], ["plain", "Ordinary"]];

function Account() {
  const [amt, setAmt] = useState("1");
  if (!S.wallet) {
    return (
      <div className="card stack">
        <div><span className="eyebrow">Account</span><h2>Connect to trade</h2></div>
        <p className="sub">Any EVM browser wallet works. The console adds Monad testnet (chain 10143) if your wallet doesn't have it.</p>
        <button className="btn fire" onClick={connect}>Connect wallet</button>
        <p className="note">No wallet? The Race Lab runs with two throwaway wallets kept in this browser.</p>
      </div>
    );
  }
  const b = S.bal || {};
  const cooldown = b.lastClaim ? Number(b.lastClaim) + 3600 - Date.now() / 1000 : 0;
  const approve = async () => {
    if (!need()) return;
    for (const t of [ADDR.wmon, ADDR.usd]) for (const bk of [ADDR.recall, ADDR.plain]) {
      const a = await pc.readContract({ address: t, abi: erc20Abi, functionName: "allowance", args: [S.wallet.address, bk] });
      if (a < parseEther("1000000")) await act("Approve", () => w({ address: t, abi: erc20Abi, functionName: "approve", args: [bk, 2n ** 256n - 1n] }));
    }
  };
  return (
    <div className="card stack">
      <div><span className="eyebrow">Account</span><h2>{short(S.wallet.address)}</h2></div>
      <div className="grid g3">
        <Stat n={b.mon !== undefined ? mon(b.mon, 3) : "—"} l="MON" />
        <Stat n={b.wmon !== undefined ? mon(b.wmon, 3) : "—"} l="WMON" />
        <Stat n={b.usd !== undefined ? mon(b.usd, 2) : "—"} l="tUSD" />
      </div>
      <div className="row">
        <input className="input mono" value={amt} onChange={(e) => setAmt(e.target.value)} style={{ width: 90 }} />
        <Btn busyLabel="Wrap" run={() => need() && act("Wrap", () => w({ address: ADDR.wmon, abi: erc20Abi, functionName: "deposit", value: parseEther(amt || "0") }))}>Wrap MON</Btn>
        <Btn className="btn ghost sm" busyLabel="Unwrap" run={() => need() && act("Unwrap", () => w({ address: ADDR.wmon, abi: erc20Abi, functionName: "withdraw", args: [parseEther(amt || "0")] }))}>Unwrap</Btn>
      </div>
      <div className="row">
        <Btn disabled={cooldown > 0} busyLabel="Claim" run={() => need() && act("Claim", () => w({ address: ADDR.usd, abi: erc20Abi, functionName: "claim" }))}>
          {cooldown > 0 ? `Claim in ${Math.ceil(cooldown / 60)} min` : "Claim 1,000 tUSD"}
        </Btn>
        <Btn className={"btn " + (b.approved ? "ghost" : "v") + " sm"} disabled={b.approved} busyLabel="Approving" run={approve}>
          {b.approved ? "Books approved" : "Approve both books"}
        </Btn>
      </div>
      <p className="note">tUSD has no owner and no open mint: each address can claim once an hour. WMON is the chain's own wrapped MON.</p>
    </div>
  );
}

function Post() {
  const [book, setBook] = useState("recall");
  const [side, setSide] = useState("ask");
  const [price, setPrice] = useState("");
  const [size, setSize] = useState("0.1");
  useEffect(() => {
    if (S.price && !price) setPrice((Number(S.price.median) / 1e8).toFixed(8));
  }, [S.price]); // eslint-disable-line react-hooks/exhaustive-deps
  const adj = (bps) => S.price && setPrice(((Number(S.price.median) * (1 + bps / 10000)) / 1e8).toFixed(8));
  const post = async () => {
    if (!need()) return;
    // A quote escrows WMON (ask) or tUSD (bid): approve that token for this book first if needed.
    const token = side === "ask" ? ADDR.wmon : ADDR.usd;
    const allowance = await pc.readContract({ address: token, abi: erc20Abi, functionName: "allowance", args: [S.wallet.address, BOOKS[book]] });
    if (allowance < parseEther("1000000")) {
      const ok = await act(`Approve ${side === "ask" ? "WMON" : "tUSD"}`, () => w({ address: token, abi: erc20Abi, functionName: "approve", args: [BOOKS[book], 2n ** 256n - 1n] }));
      if (!ok) return;
    }
    return postNow();
  };
  const postNow = () => act("Post", async () => {
    const px = await fetchSignedPrice({ signers: S.signers });
    const raw = price.trim();
    const p = raw ? BigInt(Math.round(Number(raw) * 1e8)) : px.median;
    return w({ address: BOOKS[book], abi: bookAbi, functionName: "post", args: [side === "ask", p, parseEther(size || "0"), px.packages] });
  });
  return (
    <div className="card stack">
      <div><span className="eyebrow">Post a quote</span><h2>Make a market</h2></div>
      <div className="row">
        <Seg value={book} onChange={setBook} options={BOOK_OPTS} />
        <Seg value={side} onChange={setSide} options={[["ask", "Ask · sell MON"], ["bid", "Bid · buy MON"]]} />
      </div>
      <div className="grid g2">
        <div className="field"><label>Price (USD per MON)</label><input className="input mono" id="postprice" placeholder="signed price" value={price} onChange={(e) => setPrice(e.target.value)} /></div>
        <div className="field"><label>Size (MON)</label><input className="input mono" id="postsize" value={size} onChange={(e) => setSize(e.target.value)} /></div>
      </div>
      <div className="row">
        <button className="btn ghost sm" onClick={() => adj(-10)}>−10 bps</button>
        <button className="btn ghost sm" onClick={() => adj(0)}>At signed price</button>
        <button className="btn ghost sm" onClick={() => adj(10)}>+10 bps</button>
      </div>
      <Btn className="btn v" id="postbtn" busyLabel="Post" run={post}>Post with signed price</Btn>
      <p className="note">The latest signed price is attached and recorded as the quote's reference.</p>
    </div>
  );
}

function Queue({ k }) {
  const b = S.books[k];
  if (!b?.cfg || !b.takes) return <div className="card stack"><div className="empty">Loading…</div></div>;
  const waiting = b.takes.filter((t) => t.index >= b.head);
  return (
    <div className="card stack">
      <div><span className="eyebrow">Settlement queue · {NAME[k]}</span><h2>{waiting.length} waiting</h2></div>
      {!b.cfg.cancelFirst ? (
        <p className="sub">The ordinary book fills takes in the transaction that sends them, so nothing ever waits here.</p>
      ) : (
        <>
          <p className="sub">Takes wait {b.cfg.delay.toString()} blocks. Any call into the book settles eligible takes first, oldest first, up to {b.cfg.workCap.toString()} per call.</p>
          <div className="tablewrap">
            <table>
              <thead><tr><th>Take</th><th>Order</th><th>Size</th><th>Ready</th></tr></thead>
              <tbody>
                {waiting.length ? waiting.slice(0, 8).map((t) => {
                  const ready = t.blockNumber + b.cfg.delay;
                  const left = ready > S.block ? ready - S.block : 0n;
                  return (
                    <tr key={t.index.toString()}>
                      <td className="num">#{t.index.toString()}</td><td className="num">#{t.orderId.toString()}</td><td className="num">{mon(t.size)}</td>
                      <td>{left === 0n ? <span className="tag ok">eligible</span> : <span className="tag">in {left.toString()} blk</span>}</td>
                    </tr>
                  );
                }) : <tr><td colSpan={4} className="empty">Queue is empty.</td></tr>}
              </tbody>
            </table>
          </div>
          <Btn className="btn ink" disabled={!(b.eligible > 0n)} busyLabel="Settle" run={() => need() && act("Settle", () => w({ address: BOOKS[k], abi: bookAbi, functionName: "settle", args: [16n] }))}>
            Settle {b.eligible.toString()} eligible
          </Btn>
        </>
      )}
    </div>
  );
}

function OrderRow({ o, b, k, me }) {
  const [size, setSize] = useState(String(Math.min(Number(formatEther(o.remaining)), 0.5)));
  const mv = S.price && o.postPrice ? moveBps(o.postPrice, S.price.median) : null;
  const stale = mv !== null && b.cfg && mv >= Number(b.cfg.staleBps);
  const mine = me && o.maker.toLowerCase() === me;
  const cancel = () => need() && act("Cancel", async () => {
    let px = [];
    if (o.pending > 0) px = (await fetchSignedPrice({ signers: S.signers })).packages;
    return w({ address: BOOKS[k], abi: bookAbi, functionName: "cancel", args: [o.id, px] });
  });
  const take = () => need() && act("Take", () => w({ address: BOOKS[k], abi: bookAbi, functionName: "take", args: [o.id, parseEther(size || "0")] }));
  let action = null;
  if (o.live && mine) action = <Btn className={"btn " + (stale ? "v" : "ink") + " sm"} busyLabel="Cancel" run={cancel}>{stale ? "Cancel · stale proof" : "Cancel"}</Btn>;
  else if (o.live && !o.cancelRequested) action = (
    <div className="row">
      <input className="input mono" style={{ width: 80, padding: "6px 8px", fontSize: 13 }} value={size} onChange={(e) => setSize(e.target.value)} />
      <Btn className={"btn " + (o.isAsk ? "v" : "ink") + " sm"} busyLabel="Take" run={take}>{o.isAsk ? "Buy" : "Sell"}</Btn>
    </div>
  );
  return (
    <tr>
      <td className="num">{o.id.toString()}</td>
      <td className={o.isAsk ? "ask" : "bid"}>{o.isAsk ? "Ask" : "Bid"}</td>
      <td className="num">${fmtPrice(o.price)}</td>
      <td className="num">{mon(o.remaining)}</td>
      <td className="num">${fmtPrice(o.postPrice)}</td>
      <td className="num">{mv === null ? "—" : <>{mv.toFixed(2)} bps {stale && o.live && <span className="tag solid">stale</span>}</>}</td>
      <td className="num">{o.pending.toString()}</td>
      <td>{o.live && o.cancelRequested ? <span className="tag v">cancel waiting</span> : o.live ? <span className="tag ok">live</span> : <span className="tag">closed</span>}</td>
      <td>{mine ? <span className="tag dark">you</span> : <Addr a={o.maker} />}</td>
      <td>{action}</td>
    </tr>
  );
}

function Orders({ k, setK }) {
  const [onlyLive, setOnlyLive] = useState(true);
  const b = S.books[k];
  const me = S.wallet?.address?.toLowerCase();
  let body;
  if (!b?.orders) body = <div className="empty">Loading…</div>;
  else {
    const list = b.orders.filter((o) => !onlyLive || o.live);
    body = !list.length ? <div className="empty">{onlyLive ? "No live quotes. Post one above." : "No quotes yet."}</div> : (
      <div className="tablewrap">
        <table>
          <thead><tr><th>#</th><th>Side</th><th>Price</th><th>Left (MON)</th><th>Posted ref</th><th>Move now</th><th>Waiting takes</th><th>Status</th><th>Maker</th><th>Action</th></tr></thead>
          <tbody>{list.map((o) => <OrderRow key={k + o.id} o={o} b={b} k={k} me={me} />)}</tbody>
        </table>
      </div>
    );
  }
  return (
    <Card eyebrow="Order book" title={`${NAME[k]} book`} right={
      <div className="row">
        <Seg value={k} onChange={setK} options={BOOK_OPTS} />
        <label className="row note"><input type="checkbox" checked={onlyLive} onChange={(e) => setOnlyLive(e.target.checked)} /> live only</label>
      </div>
    }>
      <div id="ordertable">{body}</div>
      <p className="note" style={{ marginTop: 12 }}>Cancelling attaches a fresh signed price. With a take waiting, the cancel lands first only if that price moved at least the book's stale threshold since your quote was posted; otherwise it waits behind the take.</p>
    </Card>
  );
}

export default function Trade() {
  useStore();
  const [k, setK] = useState("recall");
  return (
    <>
      <div className="grid g3">
        <Account />
        <Post />
        <Queue k={k} />
      </div>
      <Orders k={k} setK={setK} />
    </>
  );
}
