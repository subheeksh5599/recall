"use client";
// One client-side store for the console: chain reads, wallet, race wallets, toasts.
// Loaders mutate `S` and call `bump()`; components subscribe with `useStore()`.
import { useSyncExternalStore } from "react";
import {
  createPublicClient, createWalletClient, custom, http, parseEther, BaseError,
  ContractFunctionRevertedError, decodeEventLog,
} from "viem";
import { privateKeyToAccount, generatePrivateKey, nonceManager } from "viem/accounts";
import { monadTestnet, ADDR, bookAbi, oracleAbi, erc20Abi, fetchSignedPrice } from "@/lib/chain.js";
import { send, wait } from "@/lib/race.js";

export const EXP = monadTestnet.blockExplorers.default.url;
export const BOOKS = { recall: ADDR.recall, plain: ADDR.plain };
export const NAME = { recall: "RECALL", plain: "Ordinary" };
export const pc = createPublicClient({ chain: monadTestnet, transport: http(undefined, { batch: true, retryCount: 2 }) });

export const S = {
  block: 0n,
  price: null,
  priceErr: null,
  signers: null,
  oracle: null,
  books: {},
  wallet: null,
  bal: null,
  events: [],
  scanFrom: 0n,
  burn: null, // {maker, sniper} accounts
  bw: null, // wallet clients
  burnBal: {},
  races: [],
  toasts: [],
  booted: false,
};

let version = 0;
const listeners = new Set();
export function bump() {
  version++;
  listeners.forEach((l) => l());
}
const subscribe = (l) => (listeners.add(l), () => listeners.delete(l));
export const useStore = () => useSyncExternalStore(subscribe, () => version, () => 0);

// ------------------------------------------------------------------ toasts + errors
let toastId = 0;
export function toast(body, ok = false) {
  const id = ++toastId;
  S.toasts = [...S.toasts, { id, body, ok }];
  bump();
  setTimeout(() => { S.toasts = S.toasts.filter((t) => t.id !== id); bump(); }, ok ? 6000 : 9000);
}
export function errMsg(e) {
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
const big = (k, v) => (typeof v === "bigint" ? v.toString() : v);

// ------------------------------------------------------------------ chain reads
export async function loadConfig() {
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
  bump();
}

export async function loadBooks() {
  const base = [];
  for (const k of Object.keys(BOOKS)) {
    for (const f of ["stats", "orderCount", "queueLength", "head", "eligible"]) base.push({ address: BOOKS[k], abi: bookAbi, functionName: f });
  }
  const r = await pc.multicall({ contracts: base, allowFailure: false });
  let i = 0;
  const want = [];
  const next = {};
  for (const k of Object.keys(BOOKS)) {
    const b = { ...(S.books[k] || {}) };
    const st = r[i++];
    b.stats = { posts: st[0], takesQueued: st[1], fills: st[2], foundNothing: st[3], cancels: st[4], staleCancels: st[5], deferred: st[6], baseFilled: st[7] };
    b.orderCount = r[i++];
    b.queueLen = r[i++];
    b.head = r[i++];
    b.eligible = r[i++];
    b.orders = [];
    b.takes = [];
    next[k] = b;
    const from = b.orderCount > 60n ? b.orderCount - 59n : 1n;
    for (let id = b.orderCount; id >= from; id--) want.push({ k, id, call: { address: BOOKS[k], abi: bookAbi, functionName: "getOrder", args: [id] } });
    const tFrom = b.queueLen > 60n ? b.queueLen - 60n : 0n;
    for (let t = b.queueLen - 1n; t >= tFrom && b.queueLen > 0n; t--) want.push({ k, t, call: { address: BOOKS[k], abi: bookAbi, functionName: "getTake", args: [t] } });
  }
  const res = want.length ? await pc.multicall({ contracts: want.map((w) => w.call), allowFailure: true }) : [];
  res.forEach((x, j) => {
    if (x.status !== "success") return;
    const w = want[j];
    if (w.id !== undefined) next[w.k].orders.push({ id: w.id, ...x.result });
    else next[w.k].takes.push({ index: w.t, ...x.result });
  });
  S.books = next;
  bump();
}

export async function readBal(a) {
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

export async function loadBalances() {
  if (!S.wallet) return;
  S.bal = await readBal(S.wallet.address);
  bump();
}

export async function loadPrice() {
  try {
    S.price = await fetchSignedPrice({ signers: S.signers });
    S.priceErr = null;
  } catch (e) {
    S.priceErr = e.message;
  }
  bump();
}

export async function tailEvents() {
  const latest = await pc.getBlockNumber();
  S.block = latest;
  if (S.scanFrom === 0n) S.scanFrom = latest - 90n;
  let events = S.events;
  while (S.scanFrom <= latest) {
    const to = S.scanFrom + 99n > latest ? latest : S.scanFrom + 99n;
    const logs = await pc.getLogs({ address: [ADDR.recall, ADDR.plain], fromBlock: S.scanFrom, toBlock: to });
    for (const l of logs) {
      try {
        const ev = decodeEventLog({ abi: bookAbi, data: l.data, topics: l.topics });
        const key = l.transactionHash + ":" + l.logIndex;
        if (events.some((e) => e.key === key)) continue;
        events = [{
          key, book: l.address.toLowerCase() === ADDR.recall.toLowerCase() ? "recall" : "plain",
          name: ev.eventName, args: JSON.parse(JSON.stringify(ev.args, big)), block: l.blockNumber.toString(),
          tx: l.transactionHash, index: l.transactionIndex,
        }, ...events];
      } catch {}
    }
    S.scanFrom = to + 1n;
  }
  S.events = events.slice(0, 300);
  localStorage.setItem("recall.events", JSON.stringify(S.events));
  bump();
}

// ------------------------------------------------------------------ wallet
export async function connect() {
  const eth = window.ethereum;
  if (!eth) return toast("No browser wallet found. Install MetaMask or Rabby, or use the Race Lab wallets.");
  try {
    const [address] = await eth.request({ method: "eth_requestAccounts" });
    const id = await eth.request({ method: "eth_chainId" });
    if (parseInt(id, 16) !== monadTestnet.id) {
      try {
        await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x279f" }] });
      } catch {
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
    bump();
    await loadBalances();
  } catch (e) {
    toast(errMsg(e));
  }
}

export const need = () => {
  if (!S.wallet) { toast("Connect a wallet first."); return false; }
  return true;
};
export const w = (req) => send(pc, S.wallet.wc, req);

/** Send a transaction, wait for it, toast the result with an explorer link, refresh state. */
export async function act(label, fn, Tx) {
  try {
    const hash = await fn();
    const r = await wait(pc, hash);
    toast({ label, block: r.blockNumber.toString(), hash }, true);
    await Promise.all([loadBooks(), loadBalances()]);
    return r;
  } catch (e) {
    toast(`${label}: ${errMsg(e)}`);
  }
}

// ------------------------------------------------------------------ race wallets
export function initBurners() {
  let j = JSON.parse(localStorage.getItem("recall.burners") || "null");
  if (!j) {
    j = { maker: generatePrivateKey(), sniper: generatePrivateKey() };
    localStorage.setItem("recall.burners", JSON.stringify(j));
  }
  S.burn = { maker: privateKeyToAccount(j.maker, { nonceManager }), sniper: privateKeyToAccount(j.sniper, { nonceManager }) };
  const bwc = (account) => createWalletClient({ account, chain: monadTestnet, transport: http() });
  S.bw = { maker: bwc(S.burn.maker), sniper: bwc(S.burn.sniper) };
  S.races = JSON.parse(localStorage.getItem("recall.races") || "[]");
  S.events = JSON.parse(localStorage.getItem("recall.events") || "[]");
}
export async function loadBurners() {
  if (!S.burn) return;
  const next = {};
  for (const r of ["maker", "sniper"]) next[r] = await readBal(S.burn[r].address);
  S.burnBal = next;
  bump();
}
export function saveRace(r) {
  S.races = [JSON.parse(JSON.stringify(r, big)), ...S.races].slice(0, 30);
  localStorage.setItem("recall.races", JSON.stringify(S.races));
  bump();
}

// ------------------------------------------------------------------ boot
async function tick(fn, ms) {
  for (;;) {
    try { await fn(); } catch (e) { console.warn(e); }
    await new Promise((r) => setTimeout(r, ms));
  }
}
export async function boot() {
  if (S.booted) return;
  S.booted = true;
  initBurners();
  bump();
  await loadConfig().catch((e) => toast("RPC: " + errMsg(e)));
  await Promise.all([loadPrice(), loadBooks().catch(() => {}), loadBurners().catch(() => {})]);
  tick(tailEvents, 2500);
  tick(loadBooks, 5000);
  tick(loadPrice, 8000);
  tick(async () => { await loadBalances(); if ((location.hash || "").includes("race")) await loadBurners(); }, 10000);
  if (window.ethereum) {
    const acc = await window.ethereum.request({ method: "eth_accounts" }).catch(() => []);
    if (acc && acc.length) connect();
  }
}
