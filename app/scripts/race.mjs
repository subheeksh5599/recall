// Live race on Monad testnet. Maker = deployer key, sniper = a second local key.
// Usage: node scripts/race.mjs <recall|plain> [snipe|dodge]
import { createPublicClient, createWalletClient, http, parseEther, formatEther } from "viem";
import { privateKeyToAccount, generatePrivateKey, nonceManager } from "viem/accounts";
import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { monadTestnet, ADDR, oracleAbi } from "../../web/lib/chain.js";
import { prepare, race, wait } from "../../web/lib/race.js";

const which = process.argv[2] || "recall";
const mode = process.argv[3] || "snipe";
const dir = `${homedir()}/.config/recall`;
const env = (f, k) => readFileSync(f, "utf8").match(new RegExp(`^${k}=(.*)$`, "m"))?.[1];
const sniperFile = `${dir}/sniper.env`;
if (!existsSync(sniperFile)) {
  writeFileSync(sniperFile, `SNIPER_PK=${generatePrivateKey()}\n`);
  chmodSync(sniperFile, 0o600);
}
const makerAcc = privateKeyToAccount(env(`${dir}/deployer.env`, "DEPLOYER_PK"), { nonceManager });
const sniperAcc = privateKeyToAccount(env(sniperFile, "SNIPER_PK"), { nonceManager });
const pc = createPublicClient({ chain: monadTestnet, transport: http() });
const wc = (account) => createWalletClient({ account, chain: monadTestnet, transport: http() });
const maker = wc(makerAcc);
const sniper = wc(sniperAcc);
const log = (m) => console.log("  ", m);

const sb = await pc.getBalance({ address: sniperAcc.address });
console.log("maker", makerAcc.address, formatEther(await pc.getBalance({ address: makerAcc.address })), "MON");
console.log("sniper", sniperAcc.address, formatEther(sb), "MON");
if (sb < parseEther("0.6")) {
  const h = await maker.sendTransaction({ to: sniperAcc.address, value: parseEther("0.8") - sb, chain: monadTestnet });
  await wait(pc, h);
  console.log("funded sniper", h);
}
await prepare(pc, maker, { log });
await prepare(pc, sniper, { log, wmon: parseEther("0.55") });
const signers = await pc.readContract({ address: ADDR.oracle, abi: oracleAbi, functionName: "signers" });
const result = await race(pc, {
  maker, sniper, book: ADDR[which], mode, signers,
  onStep: (s) => console.log(JSON.stringify(s, (k, v) => (typeof v === "bigint" ? v.toString() : v))),
});
mkdirSync("evidence", { recursive: true });
const f = `evidence/race-${which}-${mode}-${Date.now()}.json`;
writeFileSync(f, JSON.stringify(result, (k, v) => (typeof v === "bigint" ? v.toString() : v), 2));
console.log("wrote", f);
