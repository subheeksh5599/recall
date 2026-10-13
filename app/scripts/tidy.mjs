// Cancel every live quote a key owns on both books. Usage: node scripts/tidy.mjs <maker|sniper|deployer|tester>
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { monadTestnet, ADDR, bookAbi } from "../../web/lib/chain.js";
import { send, wait } from "../../web/lib/race.js";
const who = process.argv[2] || "deployer";
const c = `${homedir()}/.config/recall`;
const pk = who === "maker" || who === "sniper" ? JSON.parse(readFileSync(`${c}/burners.json`, "utf8"))[who]
  : readFileSync(`${c}/${who}.env`, "utf8").match(/^[A-Z]+_PK=(.*)$/m)[1];
const acc = privateKeyToAccount(pk);
const pc = createPublicClient({ chain: monadTestnet, transport: http() });
const wc = createWalletClient({ account: acc, chain: monadTestnet, transport: http() });
for (const k of ["recall", "plain"]) {
  const n = await pc.readContract({ address: ADDR[k], abi: bookAbi, functionName: "orderCount" });
  for (let id = 1n; id <= n; id++) {
    const o = await pc.readContract({ address: ADDR[k], abi: bookAbi, functionName: "getOrder", args: [id] });
    if (o.live && o.maker.toLowerCase() === acc.address.toLowerCase() && !o.cancelRequested) {
      const h = await send(pc, wc, { address: ADDR[k], abi: bookAbi, functionName: "cancel", args: [id, []] });
      await wait(pc, h);
      console.log("cancelled", k, id.toString(), h);
    }
  }
}
