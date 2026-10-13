// Gas charged per book action, read from the receipts of the recorded races. Monad charges the gas
// LIMIT, and its receipts report that charged amount as gasUsed.
import { createPublicClient, http, decodeFunctionData } from "viem";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { monadTestnet, bookAbi } from "../../web/lib/chain.js";
const pc = createPublicClient({ chain: monadTestnet, transport: http() });
const rows = [];
for (const f of readdirSync("evidence").filter((x) => x.startsWith("race-") && x.endsWith(".json"))) {
  const r = JSON.parse(readFileSync("evidence/" + f));
  const label = (r.cancelFirst ? "RECALL" : "ordinary") + " " + r.mode;
  const hs = [...r.posts.map((h) => [h, "post"]), [r.take.hash, "take"], [r.cancel.hash, "cancel"], ...(r.settle ? [[r.settle, "settle"]] : [])];
  for (const [h, what] of hs) {
    const [tx, rc] = await Promise.all([pc.getTransaction({ hash: h }), pc.getTransactionReceipt({ hash: h })]);
    const fn = decodeFunctionData({ abi: bookAbi, data: tx.input }).functionName;
    rows.push({ run: label, action: what, fn, gasUsed: Number(rc.gasUsed), gasLimit: Number(tx.gas), tx: h });
  }
}
const by = {};
for (const r of rows) {
  const k = `${r.run.split(" ")[0]} · ${r.action}${r.action === "cancel" ? " (" + r.run.split(" ")[1] + ")" : ""}`;
  (by[k] ||= []).push(r);
}
const table = Object.entries(by).map(([k, v]) => ({ action: k, n: v.length, medianUsed: v.map((x) => x.gasUsed).sort((a, b) => a - b)[Math.floor(v.length / 2)], medianLimit: v.map((x) => x.gasLimit).sort((a, b) => a - b)[Math.floor(v.length / 2)] }));
console.table(table);
writeFileSync("evidence/gas-report.json", JSON.stringify({ table, rows }, null, 2));
