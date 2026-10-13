// The race: a maker's quote goes stale, a sniper pays 50x the priority fee to take it, the maker
// sends an ordinary cancel at the same moment. Same code drives the dashboard and the node runner.
import { decodeEventLog, encodeFunctionData, parseEther } from "viem";
import { ADDR, bookAbi, erc20Abi, fetchSignedPrice, moveBps } from "./chain.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function fees(pc, mult = 1n) {
  const block = await pc.getBlock();
  const base = block.baseFeePerGas ?? (await pc.getGasPrice());
  const prio = 2_000_000_000n * mult; // 2 gwei, times the multiplier
  return { maxFeePerGas: base * 2n + prio, maxPriorityFeePerGas: prio };
}

/** Send a contract write with a measured gas limit (Monad charges the limit, so keep it tight). */
export async function send(pc, wc, req, { mult = 1n, log } = {}) {
  const account = wc.account;
  const gas = await pc.estimateContractGas({ ...req, account });
  const f = await fees(pc, mult);
  const hash = await wc.writeContract({ ...req, account, chain: wc.chain, gas: (gas * 13n) / 10n, ...f });
  log && log(`sent ${req.functionName} ${hash}`);
  return hash;
}

export async function wait(pc, hash) {
  const r = await pc.waitForTransactionReceipt({ hash, pollingInterval: 400, timeout: 90_000 });
  if (r.status !== "success") throw new Error(`tx reverted ${hash}`);
  return r;
}

export function bookEvents(receipt, book) {
  const out = [];
  for (const l of receipt.logs) {
    if (l.address.toLowerCase() !== book.toLowerCase()) continue;
    try {
      out.push(decodeEventLog({ abi: bookAbi, data: l.data, topics: l.topics }));
    } catch {}
  }
  return out;
}

/** Make sure `wc` holds WMON and tUSD and has approved both books. */
export async function prepare(pc, wc, { wmon = parseEther("1.2"), log } = {}) {
  const me = wc.account.address;
  const [w, u, last] = await Promise.all([
    pc.readContract({ address: ADDR.wmon, abi: erc20Abi, functionName: "balanceOf", args: [me] }),
    pc.readContract({ address: ADDR.usd, abi: erc20Abi, functionName: "balanceOf", args: [me] }),
    pc.readContract({ address: ADDR.usd, abi: erc20Abi, functionName: "lastClaim", args: [me] }),
  ]);
  if (w < wmon) {
    const bal = await pc.getBalance({ address: me });
    if (bal < wmon - w + parseEther("0.2")) throw new Error(`need ${Number(wmon - w + parseEther("0.2")) / 1e18} MON to wrap and pay gas, have ${Number(bal) / 1e18}`);
    await wait(pc, await send(pc, wc, { address: ADDR.wmon, abi: erc20Abi, functionName: "deposit", value: wmon - w }, { log }));
  }
  if (u < parseEther("1") && last === 0n) {
    await wait(pc, await send(pc, wc, { address: ADDR.usd, abi: erc20Abi, functionName: "claim" }, { log }));
  }
  for (const token of [ADDR.wmon, ADDR.usd]) {
    for (const book of [ADDR.recall, ADDR.plain]) {
      const a = await pc.readContract({ address: token, abi: erc20Abi, functionName: "allowance", args: [me, book] });
      if (a < parseEther("1000000")) {
        await wait(pc, await send(pc, wc, { address: token, abi: erc20Abi, functionName: "approve", args: [book, 2n ** 256n - 1n] }, { log }));
      }
    }
  }
}

/**
 * Run one race on `book`.
 * mode "snipe": wait for a real move >= staleBps, then take the stale side vs cancel.
 * mode "dodge": no waiting; a fair take lands, the maker cancels with no move.
 */
export const CANCEL_LAG_MS = 150;

export async function race(pc, { maker, sniper, book, size = parseEther("0.5"), mode = "snipe", signers, onStep = () => {}, timeoutMs = 240_000 }) {
  const t0 = Date.now();
  const step = (k, data = {}) => onStep({ k, at: Date.now() - t0, ...data });
  const staleBps = Number(await pc.readContract({ address: book, abi: bookAbi, functionName: "staleBps" }));
  const cancelFirst = await pc.readContract({ address: book, abi: bookAbi, functionName: "cancelFirst" });

  // 0. preflight: both sides must be able to escrow `size`
  for (const [who, wcx] of mode === "dodge" ? [["maker", maker]] : [["maker", maker], ["sniper", sniper]]) {
    const wb = await pc.readContract({ address: ADDR.wmon, abi: erc20Abi, functionName: "balanceOf", args: [wcx.account.address] });
    if (wb < size) throw new Error(`${who} holds ${Number(wb) / 1e18} WMON, needs ${Number(size) / 1e18}. Prepare again or lower the size.`);
  }

  // 1. maker quotes both sides at the signed price
  const px0 = await fetchSignedPrice({ signers });
  const p = px0.median;
  step("price", { price: p.toString(), ts: px0.timestampMs });
  const hAsk = await send(pc, maker, { address: book, abi: bookAbi, functionName: "post", args: [true, p, size, px0.packages] });
  const hBid = await send(pc, maker, { address: book, abi: bookAbi, functionName: "post", args: [false, p, size, px0.packages] });
  const [rAsk, rBid] = await Promise.all([wait(pc, hAsk), wait(pc, hBid)]);
  const askId = bookEvents(rAsk, book).find((e) => e.eventName === "Posted").args.id;
  const bidId = bookEvents(rBid, book).find((e) => e.eventName === "Posted").args.id;
  step("posted", { askId: askId.toString(), bidId: bidId.toString(), hashes: [hAsk, hBid], blocks: [rAsk.blockNumber.toString(), rBid.blockNumber.toString()] });

  const tidy = async (ids) => {
    for (const id of ids) {
      try { await wait(pc, await send(pc, maker, { address: book, abi: bookAbi, functionName: "cancel", args: [id, []] })); } catch {}
    }
  };
  let target = askId;
  let other = bidId;
  let pxNow = px0;
  try {
  // 2. wait for the quote to go stale (snipe) or go straight in (dodge)
  if (mode === "snipe") {
    for (;;) {
      if (Date.now() - t0 > timeoutMs) throw new Error(`no ${staleBps} bps move within ${timeoutMs / 1000}s; both quotes were pulled`);
      await sleep(3000);
      try {
        pxNow = await fetchSignedPrice({ signers });
      } catch {
        continue;
      }
      if (pxNow.timestampMs <= px0.timestampMs) continue;
      const mv = moveBps(p, pxNow.median);
      step("watch", { price: pxNow.median.toString(), move: mv });
      if (mv >= staleBps) {
        // price up -> the ask is cheap; price down -> the bid is rich
        if (pxNow.median > p) { target = askId; other = bidId; } else { target = bidId; other = askId; }
        break;
      }
    }
  } else {
    // fresh package after the post, no meaningful move
    for (let i = 0; i < 20; i++) {
      pxNow = await fetchSignedPrice({ signers });
      if (pxNow.timestampMs > px0.timestampMs) break;
      await sleep(2000);
    }
  }
  } catch (e) {
    await tidy([askId, bidId]);
    throw e;
  }
  const mv = moveBps(p, pxNow.median);
  step("stale", { target: target.toString(), move: mv, price: pxNow.median.toString() });

  // 3. fire both at once: sniper at 50x priority, maker at 1x
  const takeReq = { address: book, abi: bookAbi, functionName: "take", args: [target, size] };
  const cancelReq = { address: book, abi: bookAbi, functionName: "cancel", args: [target, pxNow.packages] };
  const [takeGas, cancelGas, fSnipe, fMaker] = await Promise.all([
    pc.estimateContractGas({ ...takeReq, account: sniper.account }),
    pc.estimateContractGas({ ...cancelReq, account: maker.account }).catch(() => 600_000n),
    fees(pc, 50n),
    fees(pc, 1n),
  ]);
  // Sign both transactions first so client-side work (nonce lookups, signing) gives neither side a head start.
  const nonceOf = (acct) => acct.nonceManager
    ? acct.nonceManager.consume({ address: acct.address, chainId: pc.chain.id, client: pc })
    : pc.getTransactionCount({ address: acct.address, blockTag: "pending" });
  const [nTake, nCancel] = await Promise.all([nonceOf(sniper.account), nonceOf(maker.account)]);
  const base = { chainId: pc.chain.id, type: "eip1559", to: book };
  const [rawTake, rawCancel] = await Promise.all([
    sniper.account.signTransaction({ ...base, nonce: nTake, data: encodeFunctionData(takeReq), gas: (takeGas * 13n) / 10n, ...fSnipe }),
    maker.account.signTransaction({ ...base, nonce: nCancel, data: encodeFunctionData(cancelReq), gas: (cancelGas * 15n) / 10n + 150_000n, ...fMaker }),
  ]);
  // Worst case for the maker: the sniper is faster. Its take goes out first; the maker's cancel follows
  // CANCEL_LAG_MS later. On an ordinary book that head start is enough. On RECALL the take only queues,
  // so a cancel that lands within the delay window still wins.
  const pTake = pc.sendRawTransaction({ serializedTransaction: rawTake });
  await sleep(CANCEL_LAG_MS);
  const pCancel = pc.sendRawTransaction({ serializedTransaction: rawCancel });
  const [hTake, hCancel] = await Promise.all([pTake, pCancel]);
  step("fired", { take: hTake, cancel: hCancel, lagMs: CANCEL_LAG_MS, sniperPrio: fSnipe.maxPriorityFeePerGas.toString(), makerPrio: fMaker.maxPriorityFeePerGas.toString() });
  const [rTake, rCancel] = await Promise.all([
    pc.waitForTransactionReceipt({ hash: hTake, pollingInterval: 400 }),
    pc.waitForTransactionReceipt({ hash: hCancel, pollingInterval: 400 }),
  ]);
  const evTake = bookEvents(rTake, book);
  const evCancel = bookEvents(rCancel, book);
  step("landed", {
    take: { block: rTake.blockNumber.toString(), index: rTake.transactionIndex, status: rTake.status, events: evTake.map((e) => e.eventName) },
    cancel: { block: rCancel.blockNumber.toString(), index: rCancel.transactionIndex, status: rCancel.status, events: evCancel.map((e) => e.eventName) },
  });

  // 4. settle (cancel-first book) and read what the take got
  let evSettle = [];
  let hSettle = null;
  if (cancelFirst) {
    const d = await pc.readContract({ address: book, abi: bookAbi, functionName: "delay" });
    const need = rTake.blockNumber + d;
    while ((await pc.getBlockNumber()) < need) await sleep(400);
    const elig = await pc.readContract({ address: book, abi: bookAbi, functionName: "eligible" });
    if (elig > 0n) {
      hSettle = await send(pc, sniper, { address: book, abi: bookAbi, functionName: "settle", args: [16n] });
      evSettle = bookEvents(await wait(pc, hSettle), book);
    }
  }
  const all = [...evTake, ...evCancel, ...evSettle];
  const filled = all.some((e) => e.eventName === "Filled" && e.args.orderId === target);
  const nothing = all.some((e) => e.eventName === "FoundNothing" && e.args.orderId === target);
  const staleCancel = all.some((e) => e.eventName === "Cancelled" && e.args.id === target && e.args.stale);
  const deferred = all.some((e) => e.eventName === "CancelDeferred" && e.args.id === target);

  // 5. tidy: pull the untouched side
  try {
    await wait(pc, await send(pc, maker, { address: book, abi: bookAbi, functionName: "cancel", args: [other, []] }));
  } catch {}

  const result = {
    book,
    cancelFirst,
    mode,
    staleBps,
    move: mv,
    target: target.toString(),
    sniperFilled: filled,
    sniperFoundNothing: nothing,
    staleCancel,
    deferredCancel: deferred,
    take: { hash: hTake, block: rTake.blockNumber.toString(), index: rTake.transactionIndex },
    cancel: { hash: hCancel, block: rCancel.blockNumber.toString(), index: rCancel.transactionIndex },
    settle: hSettle,
    posts: [hAsk, hBid],
    seconds: Math.round((Date.now() - t0) / 1000),
  };
  step("result", result);
  return result;
}
