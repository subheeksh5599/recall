// Shared chain config + signed-price helpers for the dashboard and node scripts.
import { defineChain, encodePacked, keccak256, recoverAddress } from "viem";

export const monadTestnet = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: ["https://testnet-rpc.monad.xyz"] } },
  blockExplorers: { default: { name: "Monad Explorer", url: "https://testnet.monadexplorer.com" } },
  contracts: { multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" } },
  testnet: true,
});

export const ADDR = {
  oracle: "0xfD07A97627dB012D09AE6515dF7a46F008483Afa",
  usd: "0x7Ad795D2ae9E554E50f8f5342C0787E5146322C3",
  wmon: "0xFb8bf4c1CC7a94c73D209a149eA2AbEa852BC541",
  recall: "0x4Fa264Efc5DDa93c51f98cB9d5A25E81b4801916",
  plain: "0xbAf5dAE1f616F41cc0Acad3794359205bd00FCCd",
};
export const DEPLOY_BLOCK = 70354195n;

export const FEED = "MON";
export const GATEWAYS = [
  "https://oracle-gateway-1.a.redstone.finance/data-packages/latest/redstone-primary-prod",
  "https://oracle-gateway-2.a.redstone.finance/data-packages/latest/redstone-primary-prod",
];

const PKG = "(uint256 value,uint48 timestampMs,uint8 v,bytes32 r,bytes32 s)[]";
const ORDER =
  "(address maker,bool isAsk,bool live,bool cancelRequested,uint32 pending,uint64 price,uint64 postPrice,uint48 postTsMs,uint128 remaining,uint256 escrow)";
const TAKE = "(address taker,uint64 orderId,uint64 blockNumber,uint128 size,uint256 escrow)";

import { parseAbi } from "viem";
export const bookAbi = parseAbi([
  `function post(bool isAsk, uint64 price, uint128 size, ${PKG} px) returns (uint256)`,
  `function cancel(uint256 id, ${PKG} px)`,
  "function take(uint256 id, uint128 size) returns (uint256)",
  "function settle(uint256 maxTakes) returns (uint256)",
  "function orderCount() view returns (uint256)",
  `function getOrder(uint256 id) view returns (${ORDER})`,
  "function queueLength() view returns (uint256)",
  `function getTake(uint256 index) view returns (${TAKE})`,
  "function head() view returns (uint256)",
  "function eligible() view returns (uint256)",
  "function stats() view returns (uint64 posts,uint64 takesQueued,uint64 fills,uint64 takesFoundNothing,uint64 cancels,uint64 staleCancels,uint64 deferredCancels,uint128 baseFilled)",
  "function cancelFirst() view returns (bool)",
  "function delay() view returns (uint256)",
  "function staleBps() view returns (uint256)",
  "function cost(uint128 size, uint64 price) pure returns (uint256)",
  "function WORK_CAP() view returns (uint256)",
  "function MAX_PER_BLOCK() view returns (uint256)",
  "event Posted(uint256 indexed id, address indexed maker, bool isAsk, uint64 price, uint128 size, uint64 postPrice, uint48 postTsMs)",
  "event TakeQueued(uint256 indexed takeIndex, uint256 indexed orderId, address indexed taker, uint128 size, uint64 blockNumber)",
  "event Filled(uint256 indexed takeIndex, uint256 indexed orderId, address indexed taker, uint128 size, uint64 price)",
  "event FoundNothing(uint256 indexed takeIndex, uint256 indexed orderId, address indexed taker, uint128 size)",
  "event Cancelled(uint256 indexed id, bool stale, uint64 cancelPrice, uint256 moveBps)",
  "event CancelDeferred(uint256 indexed id, uint64 cancelPrice, uint256 moveBps)",
  "event CancelTooLate(uint256 indexed id)",
  "error ZeroAmount()",
  "error NotMaker()",
  "error NotLive()",
  "error OwnOrder()",
  "error TooLarge(uint256 size, uint256 remaining)",
  "error BlockQueueFull(uint256 blockNumber)",
  "error SettlementBacklog(uint256 head, uint256 queued)",
  "error StalePrice(uint48 cancelTsMs, uint48 postTsMs)",
  "error TransferFailed()",
  "error Reentrancy()",
  "error TooFewPackages(uint256 given, uint256 needed)",
  "error UnknownSigner(address signer)",
  "error DuplicateSigner(address signer)",
  "error MixedTimestamps()",
  "error TooOld(uint256 timestampSec, uint256 nowSec)",
  "error FromTheFuture(uint256 timestampSec, uint256 nowSec)",
  "error MalleableSignature()",
]);

export const oracleAbi = parseAbi([
  `function verify(${PKG} pkgs) view returns (uint256 median, uint48 timestampMs)`,
  "function signers() view returns (address[])",
  "function threshold() view returns (uint256)",
  "function maxAge() view returns (uint256)",
  "function feedId() view returns (bytes32)",
]);

export const erc20Abi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function transfer(address,uint256) returns (bool)",
  "function deposit() payable",
  "function withdraw(uint256)",
  "function claim()",
  "function lastClaim(address) view returns (uint256)",
  "function COOLDOWN() view returns (uint256)",
]);

// bytes32("MON") is left-aligned: pad on the right
const feedBytes32 = ("0x" + Buffer_from(FEED).padEnd(64, "0"));
function Buffer_from(s) {
  return Array.from(new TextEncoder().encode(s)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function digest(value, tsMs) {
  return keccak256(
    encodePacked(["bytes32", "uint256", "uint48", "uint32", "uint24"], [feedBytes32, value, tsMs, 32, 1])
  );
}

function b64ToHex(b64) {
  const bin = typeof atob === "function" ? atob(b64) : globalThis.Buffer.from(b64, "base64").toString("binary");
  let h = "";
  for (let i = 0; i < bin.length; i++) h += bin.charCodeAt(i).toString(16).padStart(2, "0");
  return h;
}

/** Fetch the latest signed MON/USD packages and return verified ones in contract form. */
export async function fetchSignedPrice({ signers, need = 3 } = {}) {
  let json, lastErr;
  for (const url of GATEWAYS) {
    try {
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) throw new Error(`gateway ${r.status}`);
      json = await r.json();
      break;
    } catch (e) {
      lastErr = e;
    }
  }
  if (!json) throw lastErr || new Error("price gateway unreachable");
  const raw = json[FEED] || [];
  // group by timestamp, newest first
  const byTs = new Map();
  for (const p of raw) {
    const ts = p.timestampMilliseconds;
    if (!byTs.has(ts)) byTs.set(ts, []);
    byTs.get(ts).push(p);
  }
  const allowed = signers ? new Set(signers.map((s) => s.toLowerCase())) : null;
  for (const ts of [...byTs.keys()].sort((a, b) => b - a)) {
    const out = [];
    const seen = new Set();
    for (const p of byTs.get(ts)) {
      const signer = p.signerAddress.toLowerCase();
      if (seen.has(signer) || (allowed && !allowed.has(signer))) continue;
      const hex = b64ToHex(p.signature);
      const r = "0x" + hex.slice(0, 64);
      const s = "0x" + hex.slice(64, 128);
      let v = parseInt(hex.slice(128, 130), 16);
      if (v < 27) v += 27;
      const f = p.dataPoints[0].value;
      const guess = BigInt(Math.round(f * 1e8));
      // the float in the JSON can sit one unit off the signed integer; confirm by recovery
      for (const value of [guess, guess - 1n, guess + 1n]) {
        const rec = await recoverAddress({ hash: digest(value, BigInt(ts)), signature: { r, s, v: BigInt(v) } });
        if (rec.toLowerCase() === signer) {
          out.push({ value, timestampMs: ts, v, r, s, signer: rec });
          seen.add(signer);
          break;
        }
      }
    }
    if (out.length >= need) {
      const pk = out.slice(0, need);
      const vals = pk.map((x) => x.value).sort((a, b) => (a < b ? -1 : 1));
      const median = need % 2 ? vals[(need - 1) / 2] : (vals[need / 2 - 1] + vals[need / 2]) / 2n;
      return {
        median,
        timestampMs: ts,
        packages: pk.map(({ value, timestampMs, v, r, s }) => ({ value, timestampMs, v, r, s })),
        signers: pk.map((x) => x.signer),
      };
    }
  }
  throw new Error("no timestamp with enough valid signatures");
}

export const fmtPrice = (p1e8) => (Number(p1e8) / 1e8).toFixed(6);
export const moveBps = (a, b) => (a === 0n ? 0 : Number(((a > b ? a - b : b - a) * 1000000n) / a) / 100);
