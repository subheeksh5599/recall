// Re-read every recorded race from chain receipts and print the book events each transaction emitted.
import { createPublicClient, http, decodeEventLog } from "viem";
import { monadTestnet, bookAbi } from "../../web/lib/chain.js";
import { readFileSync, readdirSync } from "node:fs";
const pc = createPublicClient({ chain: monadTestnet, transport: http() });
for (const f of readdirSync("evidence").filter((x) => x.startsWith("race-") && x.endsWith(".json"))) {
  const r = JSON.parse(readFileSync("evidence/" + f));
  const evs = [];
  for (const h of [r.take.hash, r.cancel.hash, r.settle].filter(Boolean)) {
    const rc = await pc.getTransactionReceipt({ hash: h });
    for (const l of rc.logs) { try { const e = decodeEventLog({ abi: bookAbi, data: l.data, topics: l.topics }); evs.push(`${e.eventName}(${e.args.orderId ?? e.args.id})@${rc.blockNumber}:${rc.transactionIndex}`); } catch {} }
  }
  console.log(f, r.cancelFirst ? "RECALL" : "PLAIN", r.mode, "|", evs.join(" "));
}
