// Post one quote from the deployer key: node scripts/post.mjs <recall|plain> <ask|bid> <sizeMON>
import { createPublicClient, createWalletClient, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { monadTestnet, ADDR, bookAbi, oracleAbi, fetchSignedPrice } from "../src/chain.js";
import { prepare, send, wait, bookEvents } from "../src/race.js";
const [which = "recall", side = "bid", size = "0.1"] = process.argv.slice(2);
const pk = readFileSync(`${homedir()}/.config/recall/deployer.env`, "utf8").match(/^DEPLOYER_PK=(.*)$/m)[1];
const pc = createPublicClient({ chain: monadTestnet, transport: http() });
const wc = createWalletClient({ account: privateKeyToAccount(pk), chain: monadTestnet, transport: http() });
await prepare(pc, wc, { wmon: side === "ask" ? parseEther(size) : 0n });
const signers = await pc.readContract({ address: ADDR.oracle, abi: oracleAbi, functionName: "signers" });
const px = await fetchSignedPrice({ signers });
const r = await wait(pc, await send(pc, wc, { address: ADDR[which], abi: bookAbi, functionName: "post", args: [side === "ask", px.median, parseEther(size), px.packages] }));
console.log("posted", bookEvents(r, ADDR[which])[0].args.id.toString(), r.transactionHash);
