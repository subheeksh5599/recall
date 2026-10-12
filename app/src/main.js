import {
  createPublicClient, createWalletClient, custom, http, formatEther, parseEther, BaseError,
  ContractFunctionRevertedError, decodeEventLog,
} from "viem";
import { privateKeyToAccount, generatePrivateKey, nonceManager } from "viem/accounts";
import {
  monadTestnet, ADDR, bookAbi, oracleAbi, erc20Abi, fetchSignedPrice, fmtPrice, moveBps,
} from "./chain.js";
import { prepare, race, send, wait } from "./race.js";

// ------------------------------------------------------------------ setup
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const EXP = monadTestnet.blockExplorers.default.url;
const pc = createPublicClient({ chain: monadTestnet, transport: http(undefined, { batch: true, retryCount: 2 }) });
const BOOKS = { recall: ADDR.recall, plain: ADDR.plain };
const NAME = { recall: "RECALL", plain: "Ordinary" };
const short = (a) => (a ? a.slice(0, 6) + "…" + a.slice(-4) : "—");
const txl = (h, label) => (h ? `<a class="tx" href="${EXP}/tx/${h}" target="_blank" rel="noreferrer">${label || short(h)}</a>` : "—");
const addrl = (a, label) => `<a class="tx" href="${EXP}/address/${a}" target="_blank" rel="noreferrer">${label || short(a)}</a>`;
const mon = (w, d = 4) => Number(formatEther(w)).toLocaleString(undefined, { maximumFractionDigits: d });
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const big = (k, v) => (typeof v === "bigint" ? v.toString() : v);

const S = {
  block: 0n,
  price: null, // {median, timestampMs, packages}
  signers: null,
  books: {}, // key -> {cfg, stats, orders, queueLen, head, eligible, takes}
  wallet: null, // {wc, address}
  bal: null,
  events: JSON.parse(localStorage.getItem("recall.events") || "[]"),
  scanFrom: 0n,
  ui: { postBook: "recall", postSide: "ask", viewBook: "recall", raceBook: "recall", raceMode: "snipe", takeBook: "recall" },
  racing: false,
};

/** Replace a container's HTML without losing what the user is typing. */
function paint(el, html) {
  if (!el) return false;
  const active = document.activeElement;
  if (active && el.contains(active) && (active.tagName === "INPUT" || active.tagName === "SELECT")) return false;
  if (el.querySelector("button:disabled .spin")) return false; // an action is in flight
  const keep = {};
  el.querySelectorAll("input[id], input[data-size]").forEach((i) => { keep[i.id || "s" + i.dataset.size] = i.value; });
  el.innerHTML = html;
  el.querySelectorAll("input[id], input[data-size]").forEach((i) => { const k = i.id || "s" + i.dataset.size; if (k in keep) i.value = keep[k]; });
  return true;
}

function toast(msg, ok = false) {
  const d = document.createElement("div");
  if (ok) d.className = "ok";
  d.innerHTML = msg;
  $("#toast").appendChild(d);
  setTimeout(() => d.remove(), ok ? 6000 : 9000);
}

function errMsg(e) {
  if (e instanceof BaseError) {
    const r = e.walk((x) => x instanceof ContractFunctionRevertedError);
    if (r && r.data?.errorName) {
      const args = (r.data.args || []).map((a) => (typeof a === "bigint" ? a.toString() : a)).join(", ");
      return `${r.data.errorName}(${args})`;
    }
    return e.shortMessage || e.message;
  }
  return e?.message || String(e);
}

// ------------------------------------------------------------------ routing
const TITLES = { overview: "Overview", trade: "Trade", race: "Race Lab", activity: "Activity", contracts: "Contracts" };
function route() {
  const v = (location.hash || "#overview").slice(1);
  const view = TITLES[v] ? v : "overview";
  $$(".view").forEach((s) => s.classList.toggle("active", s.id === "view-" + view));
  $$(".nav a[data-view]").forEach((a) => a.classList.toggle("active", a.dataset.view === view));
  $("#crumb").textContent = TITLES[view];
  $("#side").classList.remove("open");
  renderAll();
}
window.addEventListener("hashchange", route);
$("#burger").onclick = () => $("#side").classList.toggle("open");

function seg(id, key, after) {
  $$(`#${id} button`).forEach((b) =>
    b.addEventListener("click", () => {
      S.ui[key] = b.dataset.v;
      $$(`#${id} button`).forEach((x) => x.classList.toggle("on", x === b));
      $$(`#${id} button`).forEach((x) => x.classList.toggle("v", x === b && x.dataset.v === "recall"));
      after && after();
    })
  );
}
seg("postbook", "postBook");
seg("postside", "postSide");
seg("viewbook", "viewBook", () => renderOrders());
seg("racebook", "raceBook");
seg("racemode", "raceMode", () => {
  $("#racenote").textContent = S.ui.raceMode === "snipe"
    ? "Snipe waits for a real signed-price move of at least the book's threshold. Nothing is simulated."
    : "Dodge: the sniper wallet takes as a fair buyer while the price is flat, and the maker tries to cancel against it.";
});
seg("takebook", "takeBook", () => renderTakes());

// ------------------------------------------------------------------ chain reads
async function loadConfig() {
  const calls = [];
  for (const k of Object.keys(BOOKS)) {
    for (const f of ["cancelFirst", "delay", "staleBps", "WORK_CAP", "MAX_PER_BLOCK"]) calls.push({ address: BOOKS[k], abi: bookAbi, functionName: f });
  }
  const r = await pc.multicall({ contracts: calls, allowFailure: false });
  let i = 0;
  for (const k of Object.keys(BOOKS)) {
    S.books[k] = S.books[k] || {};
    S.books[k].cfg = { cancelFirst: r[i++], delay: r[i++], staleBps: r[i++], workCap: r[i++], maxPerBlock: r[i++] };
  }
  const [signers, threshold, maxAge] = await pc.multicall({
    contracts: ["signers", "threshold", "maxAge"].map((f) => ({ address: ADDR.oracle, abi: oracleAbi, functionName: f })),
    allowFailure: false,
  });
  S.signers = signers;
  S.oracle = { signers, threshold, maxAge };
}

async function loadBooks() {
  const base = [];
  for (const k of Object.keys(BOOKS)) {
    for (const f of ["stats", "orderCount", "queueLength", "head", "eligible"]) base.push({ address: BOOKS[k], abi: bookAbi, functionName: f });
  }
  const r = await pc.multicall({ contracts: base, allowFailure: false });
  let i = 0;
  const want = [];
  for (const k of Object.keys(BOOKS)) {
    const b = (S.books[k] = S.books[k] || {});
    const st = r[i++];
    b.stats = { posts: st[0], takesQueued: st[1], fills: st[2], foundNothing: st[3], cancels: st[4], staleCancels: st[5], deferred: st[6], baseFilled: st[7] };
    b.orderCount = r[i++];
    b.queueLen = r[i++];
    b.head = r[i++];
    b.eligible = r[i++];
    const from = b.orderCount > 60n ? b.orderCount - 59n : 1n;
    for (let id = b.orderCount; id >= from; id--) want.push({ k, id, call: { address: BOOKS[k], abi: bookAbi, functionName: "getOrder", args: [id] } });
    const tFrom = b.queueLen > 60n ? b.queueLen - 60n : 0n;
    for (let t = b.queueLen - 1n; t >= tFrom && b.queueLen > 0n; t--) want.push({ k, t, call: { address: BOOKS[k], abi: bookAbi, functionName: "getTake", args: [t] } });
  }
  const res = want.length ? await pc.multicall({ contracts: want.map((w) => w.call), allowFailure: true }) : [];
  for (const k of Object.keys(BOOKS)) { S.books[k].orders = []; S.books[k].takes = []; }
  res.forEach((x, j) => {
    if (x.status !== "success") return;
    const w = want[j];
    if (w.id !== undefined) S.books[w.k].orders.push({ id: w.id, ...x.result });
    else S.books[w.k].takes.push({ index: w.t, ...x.result });
  });
}

async function loadBalances() {
  if (!S.wallet) return;
  const a = S.wallet.address;
  S.bal = await readBal(a);
}
async function readBal(a) {
  const [m, r] = await Promise.all([
    pc.getBalance({ address: a }),
    pc.multicall({
      contracts: [
        { address: ADDR.wmon, abi: erc20Abi, functionName: "balanceOf", args: [a] },
        { address: ADDR.usd, abi: erc20Abi, functionName: "balanceOf", args: [a] },
        { address: ADDR.usd, abi: erc20Abi, functionName: "lastClaim", args: [a] },
        { address: ADDR.wmon, abi: erc20Abi, functionName: "allowance", args: [a, ADDR.recall] },
        { address: ADDR.wmon, abi: erc20Abi, functionName: "allowance", args: [a, ADDR.plain] },
        { address: ADDR.usd, abi: erc20Abi, functionName: "allowance", args: [a, ADDR.recall] },
        { address: ADDR.usd, abi: erc20Abi, functionName: "allowance", args: [a, ADDR.plain] },
      ],
      allowFailure: false,
    }),
  ]);
  const [w, u, last, aw1, aw2, au1, au2] = r;
  const lim = parseEther("1000000");
  return { mon: m, wmon: w, usd: u, lastClaim: last, approved: aw1 > lim && aw2 > lim && au1 > lim && au2 > lim };
}

async function loadPrice() {
  try {
    S.price = await fetchSignedPrice({ signers: S.signers });
    S.priceErr = null;
  } catch (e) {
    S.priceErr = e.message;
  }
}

async function tailEvents() {
  const latest = await pc.getBlockNumber();
  S.block = latest;
  if (S.scanFrom === 0n) S.scanFrom = latest - 90n;
  while (S.scanFrom <= latest) {
    const to = S.scanFrom + 99n > latest ? latest : S.scanFrom + 99n;
    const logs = await pc.getLogs({ address: [ADDR.recall, ADDR.plain], fromBlock: S.scanFrom, toBlock: to });
    for (const l of logs) {
      try {
        const ev = decodeEventLog({ abi: bookAbi, data: l.data, topics: l.topics });
        const key = l.transactionHash + ":" + l.logIndex;
        if (S.events.some((e) => e.key === key)) continue;
        S.events.unshift({
          key, book: l.address.toLowerCase() === ADDR.recall.toLowerCase() ? "recall" : "plain",
          name: ev.eventName, args: JSON.parse(JSON.stringify(ev.args, big)), block: l.blockNumber.toString(),
          tx: l.transactionHash, index: l.transactionIndex,
        });
      } catch {}
    }
    S.scanFrom = to + 1n;
  }
  S.events = S.events.slice(0, 300);
  localStorage.setItem("recall.events", JSON.stringify(S.events));
}

// ------------------------------------------------------------------ wallet
async function connect() {
  const eth = window.ethereum;
  if (!eth) return toast("No browser wallet found. Install MetaMask or Rabby, or use the Race Lab wallets.");
  try {
    const [address] = await eth.request({ method: "eth_requestAccounts" });
    const id = await eth.request({ method: "eth_chainId" });
    if (parseInt(id, 16) !== monadTestnet.id) {
      try {
        await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x279f" }] });
      } catch (e) {
        await eth.request({
          method: "wallet_addEthereumChain",
          params: [{ chainId: "0x279f", chainName: "Monad Testnet", nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 }, rpcUrls: ["https://testnet-rpc.monad.xyz"], blockExplorerUrls: [EXP] }],
        });
      }
    }
    const wc = createWalletClient({ account: address, chain: monadTestnet, transport: custom(eth) });
    S.wallet = { wc, address };
    eth.on?.("accountsChanged", () => location.reload());
    eth.on?.("chainChanged", () => location.reload());
    $("#connect").textContent = short(address);
    $("#acctchip").style.display = "flex";
    $("#acct").textContent = short(address);
    await loadBalances();
    renderAll();
  } catch (e) {
    toast(errMsg(e));
  }
}
$("#connect").onclick = connect;

/** Run a wallet write with button feedback and a toast. */
async function act(btn, label, fn) {
  const old = btn?.innerHTML;
  if (btn) { btn.disabled = true; btn.innerHTML = `<span class="spin"></span>${label}`; }
  try {
    const hash = await fn();
    const r = await wait(pc, hash);
    toast(`${label}: done in block ${r.blockNumber} · ${txl(hash)}`, true);
    await Promise.all([loadBooks(), loadBalances()]);
    renderAll();
    return r;
  } catch (e) {
    toast(`${label}: ${esc(errMsg(e))}`);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = old; }
  }
}
const need = () => {
  if (!S.wallet) { toast("Connect a wallet first."); return false; }
  return true;
};
const w = (req) => send(pc, S.wallet.wc, req);

// ------------------------------------------------------------------ render: shared
function renderTop() {
  $("#blockno").textContent = S.block ? "#" + S.block.toLocaleString() : "—";
  $("#netdot").className = "dot " + (S.block ? "live" : "bad");
  if (S.price) {
    const age = Math.max(0, Math.round((Date.now() - S.price.timestampMs) / 1000));
    $("#topprice").textContent = "$" + fmtPrice(S.price.median);
    $("#sideprice").textContent = "$" + fmtPrice(S.price.median);
    $("#topage").textContent = `${S.price.packages.length} signers · ${age}s`;
    $("#sideage").textContent = age + "s";
  } else if (S.priceErr) {
    $("#topage").textContent = "price unavailable";
  }
}

function moveNow(o) {
  if (!S.price || !o.postPrice) return null;
  return moveBps(o.postPrice, S.price.median);
}

// ------------------------------------------------------------------ render: overview
function bookCard(k) {
  const b = S.books[k];
  if (!b?.stats) return `<div class="card"><div class="empty">Loading ${NAME[k]} book…</div></div>`;
  const s = b.stats;
  const dark = k === "recall";
  const live = (b.orders || []).filter((o) => o.live).length;
  return `<div class="card ${dark ? "dark" : ""}">
    <div class="cardhead"><div><span class="eyebrow">${k === "recall" ? "Cancel-first rule on" : "Rule off"}</span><h2>${NAME[k]} book</h2></div>
    <div class="row"><span class="tag ${dark ? "" : ""}">delay ${b.cfg?.delay ?? "—"} blk</span><span class="tag">stale ${b.cfg?.staleBps ?? "—"} bps</span></div></div>
    <div class="grid g4">
      <div class="stat"><div class="n">${s.fills}</div><div class="l">Fills</div></div>
      <div class="stat"><div class="n">${s.foundNothing}</div><div class="l">Takes found nothing</div></div>
      <div class="stat"><div class="n">${s.staleCancels}</div><div class="l">Stale cancels won</div></div>
      <div class="stat"><div class="n">${s.deferred}</div><div class="l">Dodges deferred</div></div>
    </div>
    <div class="grid g4" style="margin-top:8px">
      <div class="stat"><div class="n">${s.posts}</div><div class="l">Quotes posted</div></div>
      <div class="stat"><div class="n">${live}</div><div class="l">Live now</div></div>
      <div class="stat"><div class="n">${b.queueLen - b.head}</div><div class="l">Takes waiting</div></div>
      <div class="stat"><div class="n">${s.cancels}</div><div class="l">Cancels</div></div>
    </div>
    <div class="row" style="margin-top:14px;justify-content:space-between"><span class="sub">${addrl(BOOKS[k])}</span><a class="btn ${dark ? "ghost" : "ghost"} sm" href="#trade" data-goto="${k}">Trade this book</a></div>
  </div>`;
}

let EVIDENCE = null;
async function loadEvidence() {
  try { EVIDENCE = await (await fetch("/app/evidence.json", { cache: "no-store" })).json(); } catch { EVIDENCE = []; }
}
function verdict(r) {
  if (r.mode === "dodge") return r.deferredCancel ? "Dodge refused: the fair take filled" : r.sniperFilled ? "Take filled" : "Maker's cancel applied";
  if (r.sniperFoundNothing) return "Sniper found nothing: the stale cancel landed first";
  if (r.sniperFilled) return "Sniper filled the stale quote";
  return "No fill";
}
function evidenceTable(list) {
  if (!list?.length) return `<div class="empty">No runs yet.</div>`;
  return `<div class="tablewrap"><table><thead><tr><th>Book</th><th>Scenario</th><th>Move</th><th>Take (block · index)</th><th>Cancel (block · index)</th><th>Outcome</th><th>When</th></tr></thead><tbody>
  ${list.map((r) => `<tr>
    <td><span class="tag ${r.cancelFirst ? "solid" : "dark"}">${r.cancelFirst ? "RECALL" : "Ordinary"}</span></td>
    <td>${r.mode === "dodge" ? "Dodge" : "Snipe · 50× fee"}</td>
    <td class="num">${r.move} bps</td>
    <td class="num">${txl(r.take.hash, `#${r.take.block} · ${r.take.index}`)}</td>
    <td class="num">${txl(r.cancel.hash, `#${r.cancel.block} · ${r.cancel.index}`)}</td>
    <td>${r.sniperFoundNothing || r.deferredCancel ? `<span class="tag ok">${esc(verdict(r))}</span>` : `<span class="tag v">${esc(verdict(r))}</span>`}</td>
    <td class="num">${r.when ? new Date(r.when).toLocaleString() : "—"}</td></tr>`).join("")}
  </tbody></table></div>`;
}

function renderOverview() {
  $("#bookcards").innerHTML = bookCard("recall") + bookCard("plain");
  $$("[data-goto]").forEach((a) => (a.onclick = () => { S.ui.viewBook = a.dataset.goto; }));
  $("#evidence").innerHTML = evidenceTable(EVIDENCE);
}

// ------------------------------------------------------------------ render: trade
function renderAccount() {
  const el = $("#accountcard");
  if (!S.wallet) {
    if (!paint(el, `<div><span class="eyebrow">Account</span><h2>Connect to trade</h2></div>
      <p class="sub">Any EVM browser wallet works. The console adds Monad testnet (chain 10143) if your wallet doesn't have it.</p>
      <button class="btn fire" id="connect2">Connect wallet</button>
      <p class="note">No wallet? The Race Lab runs with two throwaway wallets kept in this browser.</p>`)) return;
    $("#connect2").onclick = connect;
    return;
  }
  const b = S.bal || {};
  const cooldown = b.lastClaim ? Number(b.lastClaim) + 3600 - Date.now() / 1000 : 0;
  if (!paint(el, `<div><span class="eyebrow">Account</span><h2>${short(S.wallet.address)}</h2></div>
    <div class="grid g3">
      <div class="stat"><div class="n" style="font-size:22px">${b.mon !== undefined ? mon(b.mon, 3) : "—"}</div><div class="l">MON</div></div>
      <div class="stat"><div class="n" style="font-size:22px">${b.wmon !== undefined ? mon(b.wmon, 3) : "—"}</div><div class="l">WMON</div></div>
      <div class="stat"><div class="n" style="font-size:22px">${b.usd !== undefined ? mon(b.usd, 2) : "—"}</div><div class="l">tUSD</div></div>
    </div>
    <div class="row"><input class="input mono" id="wrapamt" value="1" style="width:90px" /><button class="btn ink sm" id="wrapbtn">Wrap MON</button><button class="btn ghost sm" id="unwrapbtn">Unwrap</button></div>
    <div class="row"><button class="btn ink sm" id="claimbtn" ${cooldown > 0 ? "disabled" : ""}>${cooldown > 0 ? `Claim in ${Math.ceil(cooldown / 60)} min` : "Claim 1,000 tUSD"}</button>
    <button class="btn ${b.approved ? "ghost" : "v"} sm" id="approvebtn" ${b.approved ? "disabled" : ""}>${b.approved ? "Books approved" : "Approve both books"}</button></div>
    <p class="note">tUSD has no owner and no open mint: each address can claim once an hour. WMON is the chain's own wrapped MON.</p>`)) return;
  $("#wrapbtn").onclick = (e) => need() && act(e.currentTarget, "Wrap", () => w({ address: ADDR.wmon, abi: erc20Abi, functionName: "deposit", value: parseEther($("#wrapamt").value || "0") }));
  $("#unwrapbtn").onclick = (e) => need() && act(e.currentTarget, "Unwrap", () => w({ address: ADDR.wmon, abi: erc20Abi, functionName: "withdraw", args: [parseEther($("#wrapamt").value || "0")] }));
  $("#claimbtn").onclick = (e) => need() && act(e.currentTarget, "Claim", () => w({ address: ADDR.usd, abi: erc20Abi, functionName: "claim" }));
  $("#approvebtn").onclick = async (e) => {
    if (!need()) return;
    for (const t of [ADDR.wmon, ADDR.usd]) for (const bk of [ADDR.recall, ADDR.plain]) {
      const a = await pc.readContract({ address: t, abi: erc20Abi, functionName: "allowance", args: [S.wallet.address, bk] });
      if (a < parseEther("1000000")) await act(e.currentTarget, "Approve", () => w({ address: t, abi: erc20Abi, functionName: "approve", args: [bk, 2n ** 256n - 1n] }));
    }
  };
}

function renderQueue() {
  const k = S.ui.viewBook;
  const b = S.books[k];
  const el = $("#queuecard");
  if (!b?.cfg) { el.innerHTML = `<div class="empty">Loading…</div>`; return; }
  const waiting = (b.takes || []).filter((t) => t.index >= b.head);
  if (!paint(el, `<div><span class="eyebrow">Settlement queue · ${NAME[k]}</span><h2>${waiting.length} waiting</h2></div>
    ${!b.cfg.cancelFirst ? `<p class="sub">The ordinary book fills takes in the transaction that sends them, so nothing ever waits here.</p>` : `
    <p class="sub">Takes wait ${b.cfg.delay} blocks. Any call into the book settles eligible takes first, oldest first, up to ${b.cfg.workCap} per call.</p>
    <div class="tablewrap"><table><thead><tr><th>Take</th><th>Order</th><th>Size</th><th>Ready</th></tr></thead><tbody>
    ${waiting.length ? waiting.slice(0, 8).map((t) => { const ready = t.blockNumber + b.cfg.delay; const left = ready > S.block ? ready - S.block : 0n; return `<tr><td class="num">#${t.index}</td><td class="num">#${t.orderId}</td><td class="num">${mon(t.size)}</td><td>${left === 0n ? `<span class="tag ok">eligible</span>` : `<span class="tag">in ${left} blk</span>`}</td></tr>`; }).join("") : `<tr><td colspan="4" class="empty">Queue is empty.</td></tr>`}
    </tbody></table></div>
    <button class="btn ink" id="settlebtn" ${b.eligible > 0n ? "" : "disabled"}>Settle ${b.eligible} eligible</button>`}`)) return;
  const sb = $("#settlebtn");
  if (sb) sb.onclick = (e) => need() && act(e.currentTarget, "Settle", () => w({ address: BOOKS[k], abi: bookAbi, functionName: "settle", args: [16n] }));
}

function orderStatus(o, b) {
  if (o.live && o.cancelRequested) return `<span class="tag v">cancel waiting</span>`;
  if (o.live) return `<span class="tag ok">live</span>`;
  return `<span class="tag">closed</span>`;
}

function renderOrders() {
  const k = S.ui.viewBook;
  const b = S.books[k];
  $("#booktitle").textContent = `${NAME[k]} book`;
  $$("#viewbook button").forEach((x) => { x.classList.toggle("on", x.dataset.v === k); x.classList.toggle("v", x.dataset.v === k && k === "recall"); });
  const el = $("#ordertable");
  if (!b?.orders) { el.innerHTML = `<div class="empty">Loading…</div>`; return; }
  const onlyLive = $("#onlylive").checked;
  const list = b.orders.filter((o) => !onlyLive || o.live);
  if (!list.length) { el.innerHTML = `<div class="empty">${onlyLive ? "No live quotes. Post one above." : "No quotes yet."}</div>`; return; }
  const me = S.wallet?.address?.toLowerCase();
  if (!paint(el, `<div class="tablewrap"><table><thead><tr><th>#</th><th>Side</th><th>Price</th><th>Left (MON)</th><th>Posted ref</th><th>Move now</th><th>Waiting takes</th><th>Status</th><th>Maker</th><th>Action</th></tr></thead><tbody>
    ${list.map((o) => {
      const mv = moveNow(o);
      const stale = mv !== null && b.cfg && mv >= Number(b.cfg.staleBps);
      const mine = me && o.maker.toLowerCase() === me;
      let action = "";
      if (o.live && mine) action = `<button class="btn ${stale ? "v" : "ink"} sm" data-cancel="${o.id}">${stale ? "Cancel · stale proof" : "Cancel"}</button>`;
      else if (o.live && !o.cancelRequested) action = `<div class="row"><input class="input mono" style="width:80px;padding:6px 8px;font-size:13px" data-size="${o.id}" value="${Math.min(Number(formatEther(o.remaining)), 0.5)}" /><button class="btn ${o.isAsk ? "v" : "ink"} sm" data-take="${o.id}">${o.isAsk ? "Buy" : "Sell"}</button></div>`;
      return `<tr>
        <td class="num">${o.id}</td>
        <td class="${o.isAsk ? "ask" : "bid"}">${o.isAsk ? "Ask" : "Bid"}</td>
        <td class="num">$${fmtPrice(o.price)}</td>
        <td class="num">${mon(o.remaining)}</td>
        <td class="num">$${fmtPrice(o.postPrice)}</td>
        <td class="num">${mv === null ? "—" : `${mv.toFixed(2)} bps ${stale && o.live ? `<span class="tag solid">stale</span>` : ""}`}</td>
        <td class="num">${o.pending}</td>
        <td>${orderStatus(o, b)}</td>
        <td>${mine ? `<span class="tag dark">you</span>` : addrl(o.maker)}</td>
        <td>${action}</td></tr>`;
    }).join("")}</tbody></table></div>`)) return;
  $$("[data-cancel]", el).forEach((btn) => (btn.onclick = async (e) => {
    if (!need()) return;
    const id = BigInt(btn.dataset.cancel);
    const o = b.orders.find((x) => x.id === id);
    const target = e.currentTarget;
    await act(target, "Cancel", async () => {
      let px = [];
      if (o.pending > 0) {
        const p = await fetchSignedPrice({ signers: S.signers });
        px = p.packages;
      }
      return w({ address: BOOKS[k], abi: bookAbi, functionName: "cancel", args: [id, px] });
    });
  }));
  $$("[data-take]", el).forEach((btn) => (btn.onclick = (e) => {
    if (!need()) return;
    const id = BigInt(btn.dataset.take);
    const size = parseEther($(`[data-size="${btn.dataset.take}"]`, el).value || "0");
    act(e.currentTarget, "Take", () => w({ address: BOOKS[k], abi: bookAbi, functionName: "take", args: [id, size] }));
  }));
}

$("#onlylive").onchange = () => renderOrders();
$$("[data-adj]").forEach((b) => (b.onclick = () => {
  if (!S.price) return;
  const p = Number(S.price.median) * (1 + Number(b.dataset.adj) / 10000);
  $("#postprice").value = (p / 1e8).toFixed(8);
}));
$("#postbtn").onclick = async (e) => {
  if (!need()) return;
  const k = S.ui.postBook;
  const isAsk = S.ui.postSide === "ask";
  await act(e.currentTarget, "Post", async () => {
    const px = await fetchSignedPrice({ signers: S.signers });
    const raw = $("#postprice").value.trim();
    const price = raw ? BigInt(Math.round(Number(raw) * 1e8)) : px.median;
    const size = parseEther($("#postsize").value || "0");
    return w({ address: BOOKS[k], abi: bookAbi, functionName: "post", args: [isAsk, price, size, px.packages] });
  });
};

// ------------------------------------------------------------------ race lab
function burnerAccounts() {
  let j = JSON.parse(localStorage.getItem("recall.burners") || "null");
  if (!j) {
    j = { maker: generatePrivateKey(), sniper: generatePrivateKey() };
    localStorage.setItem("recall.burners", JSON.stringify(j));
  }
  return {
    maker: privateKeyToAccount(j.maker, { nonceManager }),
    sniper: privateKeyToAccount(j.sniper, { nonceManager }),
  };
}
const BURN = burnerAccounts();
const bwc = (account) => createWalletClient({ account, chain: monadTestnet, transport: http() });
const BW = { maker: bwc(BURN.maker), sniper: bwc(BURN.sniper) };
S.burnBal = {};

async function loadBurners() {
  for (const r of ["maker", "sniper"]) S.burnBal[r] = await readBal(BURN[r].address);
}

function renderBurners() {
  const el = $("#burnercard");
  const row = (r) => {
    const b = S.burnBal[r] || {};
    return `<div class="lane"><div><span class="eyebrow">${r}</span><div>${addrl(BURN[r].address)}</div></div>
      <div class="row mono" style="font-size:13px;justify-content:flex-end">${b.mon !== undefined ? `${mon(b.mon, 3)} MON · ${mon(b.wmon, 2)} WMON · ${mon(b.usd, 2)} tUSD ${b.approved ? `<span class="tag ok">ready</span>` : `<span class="tag">not ready</span>`}` : "…"}</div></div>`;
  };
  const low = ["maker", "sniper"].some((r) => !S.burnBal[r] || S.burnBal[r].mon < parseEther("0.2"));
  if (!paint(el, `<div><span class="eyebrow">Race wallets · this browser only</span><h2>Maker and sniper</h2></div>
    <div>${row("maker")}${row("sniper")}</div>
    <div class="row">
      <input class="input mono" id="fundamt" value="0.5" style="width:70px;padding:6px 8px;font-size:13px" /><button class="btn ${low ? "v" : "ghost"} sm" id="fundb">Fund both (MON each)</button>
      <button class="btn ghost sm" id="prepb">Prepare</button>
      <button class="btn ghost sm" id="sweepb">Sweep back</button>
      <button class="btn ghost sm" id="backupb">Back up keys</button>
    </div>
    <p class="note">Funding sends MON from your connected wallet. Prepare wraps a little MON, claims tUSD and approves the books for each race wallet. Sweep returns what's left to you. The keys live only in this browser's storage: back them up or sweep before clearing it.</p>`)) return;
  $("#backupb").onclick = () => {
    const blob = new Blob([localStorage.getItem("recall.burners")], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "recall-race-wallets.json";
    a.click();
  };
  $("#fundb").onclick = async (e) => {
    if (!need()) return;
    for (const r of ["maker", "sniper"]) {
      await act(e.currentTarget, `Fund ${r}`, () => S.wallet.wc.sendTransaction({ account: S.wallet.address, to: BURN[r].address, value: parseEther($("#fundamt").value || "0.5"), chain: monadTestnet }));
    }
    await loadBurners(); renderBurners();
  };
  $("#prepb").onclick = async (e) => {
    const t = e.currentTarget; t.disabled = true; t.innerHTML = `<span class="spin"></span>Preparing`;
    try {
      await prepare(pc, BW.maker, { wmon: parseEther("0.25"), log: (m) => tl(m) });
      await prepare(pc, BW.sniper, { wmon: parseEther("0.25"), log: (m) => tl(m) });
      toast("Race wallets ready.", true);
    } catch (err) { toast(esc(errMsg(err))); }
    await loadBurners(); renderBurners();
  };
  $("#sweepb").onclick = async (e) => {
    if (!need()) return;
    const t = e.currentTarget; t.disabled = true;
    try {
      for (const r of ["maker", "sniper"]) {
        const wc = BW[r];
        const wb = await pc.readContract({ address: ADDR.wmon, abi: erc20Abi, functionName: "balanceOf", args: [BURN[r].address] });
        if (wb > 0n) await wait(pc, await send(pc, wc, { address: ADDR.wmon, abi: erc20Abi, functionName: "withdraw", args: [wb] }));
        const bal = await pc.getBalance({ address: BURN[r].address });
        const gp = (await pc.getBlock()).baseFeePerGas * 2n;
        const keep = gp * 21000n + parseEther("0.002");
        if (bal > keep) await wait(pc, await wc.sendTransaction({ to: S.wallet.address, value: bal - keep, gas: 21000n, maxFeePerGas: gp, maxPriorityFeePerGas: 1n, chain: monadTestnet }));
      }
      toast("Swept back to your wallet.", true);
    } catch (err) { toast(esc(errMsg(err))); }
    t.disabled = false;
    await Promise.all([loadBurners(), loadBalances()]); renderAll();
  };
}

const STEP_TEXT = {
  price: (s) => `Signed price ${fmtPrice(BigInt(s.price))} fetched`,
  posted: (s) => `Maker posted ask #${s.askId} and bid #${s.bidId} at that price`,
  watch: (s) => `Watching: ${s.move} bps from the posted price`,
  stale: (s) => `Quote #${s.target} is ${s.move} bps off. Firing both transactions`,
  fired: () => `Sniper take sent at 50× priority, maker cancel at 1×`,
  landed: (s) => `Take landed in #${s.take.block} at index ${s.take.index} (${s.take.events.join(", ")}). Cancel in #${s.cancel.block} at index ${s.cancel.index} (${s.cancel.events.join(", ")})`,
  result: () => `Done`,
};
function tl(text, small = "", done = true) {
  const d = document.createElement("div");
  d.className = "st" + (done ? " done" : "");
  d.innerHTML = `<span>${esc(text)}</span>${small ? `<small>${small}</small>` : ""}`;
  const t = $("#timeline");
  if (t.firstElementChild && t.firstElementChild.textContent === "Waiting to start.") t.innerHTML = "";
  const last = t.lastElementChild;
  if (last && last.dataset.k === "watch" && text.startsWith("Watching")) last.remove();
  d.dataset.k = text.startsWith("Watching") ? "watch" : "";
  t.appendChild(d);
}
function meter(move, stale) {
  const max = stale * 2;
  $("#meterfill").style.width = Math.min(100, (move / max) * 100) + "%";
  $("#meterline").style.left = "50%";
  $("#meterlabel").textContent = `stale at ${stale} bps`;
  $("#racemove").textContent = `${move.toFixed(2)} bps`;
}

function renderResult(r) {
  const won = r.mode === "dodge" ? r.deferredCancel : r.sniperFoundNothing;
  $("#raceresult").innerHTML = `<div class="card"><div class="verdict" style="border-color:${won ? "#22c55e" : "var(--v)"}">
    <span class="eyebrow">${r.cancelFirst ? "RECALL book" : "Ordinary book"} · ${r.mode === "dodge" ? "dodge" : "snipe"} · ${r.move} bps move</span>
    <h3 style="margin-top:6px">${esc(verdict(r))}</h3>
    <div class="grid g2" style="margin-top:14px">
      <div class="stat"><div class="l">Sniper take</div><div class="mono" style="margin-top:6px">${txl(r.take.hash)} · block #${r.take.block} · index ${r.take.index}</div></div>
      <div class="stat"><div class="l">Maker cancel</div><div class="mono" style="margin-top:6px">${txl(r.cancel.hash)} · block #${r.cancel.block} · index ${r.cancel.index}</div></div>
    </div>
    <p class="note" style="margin-top:12px">${r.cancelFirst
      ? (r.mode === "dodge" ? "The cancel carried no stale proof, so it was applied after the waiting take settled." : "The take was queued for the delay. The cancel carried a signed price past the threshold, so it removed the quote first and the take was refunded.")
      : "On the ordinary book the take filled in the transaction that carried it. The cancel arrived to a filled order."}
      ${r.settle ? ` Settlement: ${txl(r.settle)}.` : ""}</p>
  </div></div>`;
}

function renderHistory() {
  const h = JSON.parse(localStorage.getItem("recall.races") || "[]");
  $("#racehistory").innerHTML = evidenceTable(h);
}

$("#racebtn").onclick = async (e) => {
  if (S.racing) return;
  const ready = ["maker", "sniper"].every((r) => S.burnBal[r]?.approved && S.burnBal[r]?.mon > parseEther("0.15"));
  if (!ready) return toast("Fund and prepare the race wallets first.");
  S.racing = true;
  const t = e.currentTarget; t.disabled = true; t.innerHTML = `<span class="spin"></span>Racing`;
  $("#timeline").innerHTML = "";
  $("#raceresult").innerHTML = "";
  const k = S.ui.raceBook;
  const stale = Number(S.books[k].cfg.staleBps);
  meter(0, stale);
  try {
    const r = await race(pc, {
      maker: BW.maker, sniper: BW.sniper, book: BOOKS[k], mode: S.ui.raceMode,
      size: parseEther($("#racesize").value || "0.2"), signers: S.signers,
      onStep: (s) => {
        if (s.k === "watch" || s.k === "stale") meter(s.move, stale);
        if (s.k === "result") return;
        const small = s.k === "posted" ? s.hashes.map((h) => txl(h)).join(" · ") : s.k === "fired" ? `${txl(s.take, "take")} · ${txl(s.cancel, "cancel")}` : "";
        tl((STEP_TEXT[s.k] || (() => s.k))(s), small, s.k !== "watch");
      },
    });
    r.when = Date.now();
    renderResult(r);
    const h = JSON.parse(localStorage.getItem("recall.races") || "[]");
    h.unshift(JSON.parse(JSON.stringify(r, big)));
    localStorage.setItem("recall.races", JSON.stringify(h.slice(0, 30)));
    renderHistory();
  } catch (err) {
    tl("Stopped: " + errMsg(err));
    toast(esc(errMsg(err)));
  }
  S.racing = false; t.disabled = false; t.innerHTML = "Run the race";
  await Promise.all([loadBurners(), loadBooks()]); renderAll();
};

// ------------------------------------------------------------------ activity + contracts
const EV_TEXT = {
  Posted: (a) => `Quote #${a.id} ${a.isAsk ? "ask" : "bid"} ${mon(BigInt(a.size))} MON at $${fmtPrice(BigInt(a.price))}`,
  TakeQueued: (a) => `Take #${a.takeIndex} on quote #${a.orderId}, ${mon(BigInt(a.size))} MON`,
  Filled: (a) => `Take #${a.takeIndex} filled ${mon(BigInt(a.size))} MON on #${a.orderId}`,
  FoundNothing: (a) => `Take #${a.takeIndex} found nothing on #${a.orderId}, refunded`,
  Cancelled: (a) => a.stale ? `Quote #${a.id} pulled with stale proof (${a.moveBps} bps)` : `Quote #${a.id} cancelled`,
  CancelDeferred: (a) => `Cancel on #${a.id} waits behind the take (${a.moveBps} bps, below threshold)`,
  CancelTooLate: (a) => `Cancel on #${a.id} arrived after the fill`,
};
function renderEvents() {
  $("#tailinfo").textContent = `from #${(S.scanFrom - 1n > 0n ? S.scanFrom - 1n : 0n).toString()} · ${S.events.length} events`;
  $("#eventtable").innerHTML = S.events.length ? `<div class="tablewrap"><table><thead><tr><th>Block · index</th><th>Book</th><th>Event</th><th>What happened</th><th>Tx</th></tr></thead><tbody>
    ${S.events.slice(0, 120).map((e) => `<tr><td class="num">#${e.block} · ${e.index}</td><td><span class="tag ${e.book === "recall" ? "solid" : "dark"}">${NAME[e.book]}</span></td><td class="mono">${e.name}</td><td>${esc((EV_TEXT[e.name] || (() => ""))(e.args))}</td><td>${txl(e.tx)}</td></tr>`).join("")}
    </tbody></table></div>` : `<div class="empty">Waiting for book events. Post, take or run a race and they appear here within a few seconds.</div>`;
}
function renderTakes() {
  const k = S.ui.takeBook;
  const b = S.books[k];
  if (!b?.takes) return;
  $("#taketable").innerHTML = b.takes.length ? `<div class="tablewrap"><table><thead><tr><th>Take</th><th>Quote</th><th>Taker</th><th>Size (MON)</th><th>Queued in</th><th>State</th></tr></thead><tbody>
    ${b.takes.map((t) => `<tr><td class="num">#${t.index}</td><td class="num">#${t.orderId}</td><td>${addrl(t.taker)}</td><td class="num">${mon(t.size)}</td><td class="num">#${t.blockNumber}</td><td>${t.index >= b.head ? `<span class="tag v">waiting</span>` : `<span class="tag">settled</span>`}</td></tr>`).join("")}
    </tbody></table></div>` : `<div class="empty">No takes on this book yet.</div>`;
}
function renderContracts() {
  const o = S.oracle;
  const card = (title, rows) => `<div class="card"><div class="cardhead"><div><span class="eyebrow">Contract</span><h2>${title}</h2></div></div><dl class="kv">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl></div>`;
  const bk = (k) => {
    const c = S.books[k]?.cfg || {};
    return card(`${NAME[k]} book`, [["Address", addrl(BOOKS[k], BOOKS[k])], ["Cancel-first", String(c.cancelFirst)], ["Delay", `${c.delay} blocks`], ["Stale threshold", `${c.staleBps} bps`], ["Settled per call", String(c.workCap)], ["Takes per block", String(c.maxPerBlock)], ["Base", addrl(ADDR.wmon, "WMON")], ["Quote", addrl(ADDR.usd, "tUSD")]]);
  };
  $("#contractcards").innerHTML = bk("recall") + bk("plain") +
    card("Signed price", [["Address", addrl(ADDR.oracle, ADDR.oracle)], ["Feed", "MON / USD"], ["Threshold", o ? `${o.threshold} of ${o.signers.length} signers` : "—"], ["Max age", o ? `${o.maxAge} s` : "—"], ["Signers", o ? o.signers.map((s) => addrl(s, s)).join("<br>") : "—"]]) +
    card("Quote token", [["Address", addrl(ADDR.usd, ADDR.usd)], ["Symbol", "tUSD"], ["Supply rule", "1,000 per address per hour, no owner"], ["Source", `<a class="tx" href="https://github.com/subheeksh5599/recall/tree/main/contracts" target="_blank" rel="noreferrer">contracts/</a>`]]);
}

// ------------------------------------------------------------------ loop
function renderAll() {
  renderTop();
  const v = (location.hash || "#overview").slice(1);
  if (v === "overview" || !TITLES[v]) renderOverview();
  if (v === "trade") { renderAccount(); renderQueue(); renderOrders(); }
  if (v === "race") { renderBurners(); renderHistory(); }
  if (v === "activity") { renderEvents(); renderTakes(); }
  if (v === "contracts") renderContracts();
}

async function tick(fn, ms) {
  for (;;) {
    try { await fn(); } catch (e) { console.warn(e); }
    renderAll();
    await new Promise((r) => setTimeout(r, ms));
  }
}

(async function boot() {
  route();
  await loadConfig().catch((e) => toast("RPC: " + esc(errMsg(e))));
  await Promise.all([loadEvidence(), loadPrice(), loadBooks().catch(() => {}), loadBurners().catch(() => {})]);
  if (S.price && !$("#postprice").value) $("#postprice").value = (Number(S.price.median) / 1e8).toFixed(8);
  renderAll();
  tick(tailEvents, 2500);
  tick(loadBooks, 5000);
  tick(loadPrice, 8000);
  tick(async () => { await loadBalances(); if ((location.hash || "").includes("race")) await loadBurners(); }, 10000);
  if (window.ethereum) {
    const acc = await window.ethereum.request({ method: "eth_accounts" }).catch(() => []);
    if (acc && acc.length) connect();
  }
})();
