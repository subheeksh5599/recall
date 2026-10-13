// Live check: fresh gateway packages verify on the deployed price contract.
import { createPublicClient, http } from "viem";
import { monadTestnet, ADDR, oracleAbi, bookAbi, fetchSignedPrice, fmtPrice } from "../../web/lib/chain.js";

const pc = createPublicClient({ chain: monadTestnet, transport: http() });
const signers = await pc.readContract({ address: ADDR.oracle, abi: oracleAbi, functionName: "signers" });
const px = await fetchSignedPrice({ signers });
const [median, ts] = await pc.readContract({ address: ADDR.oracle, abi: oracleAbi, functionName: "verify", args: [px.packages] });
console.log("gateway median", fmtPrice(px.median), "ts", px.timestampMs, "signers", px.signers.join(","));
console.log("on-chain verify", fmtPrice(median), "ts", ts.toString(), median === px.median ? "MATCH" : "MISMATCH");
for (const k of ["recall", "plain"]) {
  const [cf, d, sb] = await Promise.all(["cancelFirst", "delay", "staleBps"].map((f) => pc.readContract({ address: ADDR[k], abi: bookAbi, functionName: f })));
  console.log(k, { cancelFirst: cf, delay: d.toString(), staleBps: sb.toString() });
}
