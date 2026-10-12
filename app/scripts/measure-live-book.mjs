// Measure how often makers on a live Monad mainnet order book are filled at a stale price, and what
// that costs them. Reference price: a deep centralized venue's public 1-second MON/USDT candles.
//
// For every fill in the window:
//   staleness at fill  = how far the reference had already moved past the fill price, in the
//                        taker's favour, at the second the fill landed
//   markout at +H s    = the maker's P&L on the fill measured against the reference H seconds later
// A fill is "stale" when the reference was already >= STALE_BPS through the maker's price.
//
// Usage: node scripts/measure-live-book.mjs [hours=24]
import { writeFileSync, mkdirSync } from "node:fs";

const HOURS = Number(process.argv[2] || 24);
const LOG_RPC = "https://rpc2.monad.xyz"; // serves 5,000-block log ranges with a topic filter
const RPC = "https://rpc2.monad.xyz";
const MARKETS = {
  "MON-USDC": "0x065C9d28E428A0db40191a54d33d5b7c71a9C394",
  "MON-AUSD": "0x131a2e70a5b31a517a74b8c567149bc294470da9",
};
// Trade(uint40 orderId, address maker, bool isBuy, uint256 price, uint96 updatedSize, address taker, address origin, uint96 filledSize)
const TRADE = "0xf16924fba1c18c108912fcacaac7450c98eb3f2d8c0a3cdf3df7066c08f21581";
const CREATED = "0xb81bbaf150467ef3096ed6220cb963abc169bffd2eb88f26c47359ef344cf94c";
const CANCELLED = "0x386974f41b61738b510019ccd5a3524a43eccf0d136929e09d524e87aeeca2c4";
const SIZE_PRECISION = 1e10; // getMarketParams()[1]
const STALE_BPS = [10, 25, 50];
const HORIZONS = [1, 5, 30];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function rpc(url, method, params, tries = 6) {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
      const j = await r.json();
      if (j.error) throw new Error(j.error.message);
      return j.result;
    } catch (e) {
      if (i >= tries) throw e;
      await sleep(800 * (i + 1));
    }
  }
}
const hex = (n) => "0x" + n.toString(16);
const word = (data, i) => BigInt("0x" + data.slice(2 + i * 64, 2 + (i + 1) * 64));

// ------------------------------------------------------------------ 1. fills
const head = BigInt(await rpc(RPC, "eth_blockNumber", []));
const span = BigInt(Math.round((HOURS * 3600) / 0.4));
const from = head - span;
const fills = [];
for (const [name, addr] of Object.entries(MARKETS)) {
  for (let a = from; a <= head; a += 5000n) {
    const b = a + 4999n > head ? head : a + 4999n;
    const logs = await rpc(LOG_RPC, "eth_getLogs", [{ fromBlock: hex(a), toBlock: hex(b), address: addr, topics: [TRADE] }]);
    for (const l of logs) {
      const makerBid = word(l.data, 2) === 1n;
      const price = Number(word(l.data, 3)) / 1e18;
      const size = Number(word(l.data, 7)) / SIZE_PRECISION;
      fills.push({ market: name, t: Number(BigInt(l.blockTimestamp)), block: Number(BigInt(l.blockNumber)), tx: l.transactionHash, makerBid, price, size });
    }
    process.stdout.write(`\r${name} blocks ${a}..${b}  fills ${fills.length}   `);
  }
}
console.log();
if (!fills.length) throw new Error("no fills in window");

// ------------------------------------------------------------------ 2. reference price, 1 s
const t0 = Math.min(...fills.map((f) => f.t)) - 120;
const t1 = Math.max(...fills.map((f) => f.t)) + 120;
const ref = new Map();
const pages = [];
for (let after = (t1 + 1) * 1000; after > t0 * 1000; after -= 100_000) pages.push(after);
let done = 0;
async function page(after) {
  for (let i = 0; i < 8; i++) {
    const r = await fetch(`https://www.okx.com/api/v5/market/history-candles?instId=MON-USDT&bar=1s&after=${after}&limit=100`).then((x) => x.json()).catch(() => null);
    if (r && r.code === "0") {
      for (const c of r.data) ref.set(Number(c[0]) / 1000, Number(c[4]));
      return;
    }
    await sleep(1500 * (i + 1));
  }
  throw new Error("reference price fetch failed at " + after);
}
for (let i = 0; i < pages.length; i += 8) {
  await Promise.all(pages.slice(i, i + 8).map(page));
  done += 8;
  process.stdout.write(`\rreference seconds ${ref.size} (${Math.min(done, pages.length)}/${pages.length} pages)   `);
  await sleep(450);
}
console.log();
// forward-fill
const px = (t) => {
  for (let s = t; s > t - 300; s--) if (ref.has(s)) return ref.get(s);
  return null;
};

// basis: the on-chain book quotes in USDC/AUSD, the reference in USDT. Remove the median offset.
const offs = fills.map((f) => { const r = px(f.t); return r ? Math.log(f.price / r) : null; }).filter((x) => x !== null).sort((a, b) => a - b);
const basis = offs[Math.floor(offs.length / 2)];

// ------------------------------------------------------------------ 3. per-fill numbers
let usable = 0;
const agg = { notional: 0, stale: Object.fromEntries(STALE_BPS.map((b) => [b, { n: 0, usd: 0, notional: 0 }])), markout: Object.fromEntries(HORIZONS.map((h) => [h, { usd: 0, lossUsd: 0, n: 0 }])) };
const rows = [];
for (const f of fills) {
  const r0 = px(f.t);
  if (!r0) continue;
  usable++;
  const adj = (r) => r * Math.exp(basis);
  const notional = f.price * f.size;
  agg.notional += notional;
  // + = the reference was already through the maker's price (maker sold too cheap / bought too dear)
  const through = (f.makerBid ? f.price - adj(r0) : adj(r0) - f.price) / f.price;
  const throughBps = through * 1e4;
  for (const b of STALE_BPS) {
    if (throughBps >= b) {
      agg.stale[b].n++;
      agg.stale[b].notional += notional;
      agg.stale[b].usd += through * notional;
    }
  }
  const mk = {};
  for (const h of HORIZONS) {
    const rh = px(f.t + h);
    if (!rh) continue;
    // maker P&L marked to the reference h seconds later
    const pnl = (f.makerBid ? adj(rh) - f.price : f.price - adj(rh)) * f.size;
    mk[h] = pnl;
    agg.markout[h].usd += pnl;
    agg.markout[h].n++;
    if (pnl < 0) agg.markout[h].lossUsd += -pnl;
  }
  rows.push({ ...f, refAtFill: adj(r0), throughBps: Math.round(throughBps * 100) / 100, markout: mk });
}

// ------------------------------------------------------------------ 4. quote churn sample (last ~20 min)
let created = 0, cancelTx = 0, sampleFills = 0;
for (const addr of Object.values(MARKETS)) {
  for (let a = head - 3000n; a < head; a += 100n) {
    const logs = await rpc(RPC, "eth_getLogs", [{ fromBlock: hex(a), toBlock: hex(a + 99n), address: addr }]);
    for (const l of logs) {
      if (l.topics[0] === CREATED) created++;
      else if (l.topics[0] === CANCELLED) cancelTx++;
      else if (l.topics[0] === TRADE) sampleFills++;
    }
  }
}

const out = {
  measuredAt: new Date().toISOString(),
  window: { hours: HOURS, fromBlock: Number(from), toBlock: Number(head), fromTime: new Date(t0 * 1000).toISOString(), toTime: new Date(t1 * 1000).toISOString() },
  markets: MARKETS,
  reference: "public 1-second MON/USDT candles from a centralized exchange, forward-filled, median basis removed",
  basisBps: Math.round(basis * 1e4 * 100) / 100,
  fills: fills.length,
  fillsWithReference: usable,
  notionalUsd: Math.round(agg.notional),
  staleAtFill: Object.fromEntries(STALE_BPS.map((b) => [`>=${b}bps`, { fills: agg.stale[b].n, shareOfFills: +(agg.stale[b].n / usable).toFixed(4), notionalUsd: Math.round(agg.stale[b].notional), makerGaveUpUsd: +agg.stale[b].usd.toFixed(2) }])),
  makerMarkout: Object.fromEntries(HORIZONS.map((h) => [`+${h}s`, { fills: agg.markout[h].n, netUsd: +agg.markout[h].usd.toFixed(2), lossOnLosingFillsUsd: +agg.markout[h].lossUsd.toFixed(2), netBpsOfNotional: +((agg.markout[h].usd / agg.notional) * 1e4).toFixed(2) }])),
  quoteChurnSample: { blocks: 3000, ordersCreated: created, cancelTransactions: cancelTx, fills: sampleFills },
};
mkdirSync("evidence", { recursive: true });
writeFileSync("evidence/live-book-measurement.json", JSON.stringify(out, null, 2));
writeFileSync("evidence/live-book-fills.json", JSON.stringify(rows));
console.log(JSON.stringify(out, null, 2));
