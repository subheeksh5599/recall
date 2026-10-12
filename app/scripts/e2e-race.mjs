// Headless end-to-end check of the console's Race Lab with real transactions.
// The wallet signer lives in this node process (key read from ~/.config/recall at run time);
// the page only sees an EIP-1193 bridge. Race wallets are seeded from ~/.config/recall/burners.json.
// Usage: PLAYWRIGHT_DIR=<node_modules> node scripts/e2e-race.mjs <recall|plain> <snipe|dodge>
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { createRequire } from "node:module";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "../src/chain.js";

const require = createRequire(import.meta.url);
const dir = process.env.PLAYWRIGHT_DIR;
if (!dir) throw new Error("set PLAYWRIGHT_DIR to a node_modules folder that holds playwright");
const { chromium } = require(`${dir}/playwright`);
const [book = "recall", mode = "snipe"] = process.argv.slice(2);
const URL = process.env.APP_URL || "http://127.0.0.1:4319/app/";
const cfg = `${homedir()}/.config/recall`;
const testerPk = readFileSync(`${cfg}/tester.env`, "utf8").match(/^TESTER_PK=(.*)$/m)[1];
const burners = readFileSync(`${cfg}/burners.json`, "utf8").trim();
const acct = privateKeyToAccount(testerPk);
const wc = createWalletClient({ account: acct, chain: monadTestnet, transport: http() });

const SHIM = `(() => {
  try { if (!localStorage.getItem('recall.burners')) localStorage.setItem('recall.burners', ${JSON.stringify(burners)}); } catch (e) {}
  window.ethereum = { isMetaMask: true, on() {}, removeListener() {}, request: (a) => window.__rpcBridge(JSON.stringify(a)).then((r) => { const j = JSON.parse(r); if (j.error) { const e = new Error(j.error); throw e; } return j.result; }) };
})();`;

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.exposeFunction("__rpcBridge", async (s) => {
  const a = JSON.parse(s);
  try {
    if (a.method === "eth_accounts" || a.method === "eth_requestAccounts") return JSON.stringify({ result: [acct.address] });
    if (a.method === "eth_chainId") return JSON.stringify({ result: "0x279f" });
    if (a.method === "eth_sendTransaction") {
      const t = a.params[0];
      const h = await wc.sendTransaction({ to: t.to, data: t.data, value: t.value ? BigInt(t.value) : 0n, gas: t.gas ? BigInt(t.gas) : undefined });
      return JSON.stringify({ result: h });
    }
    const r = await fetch(monadTestnet.rpcUrls.default.http[0], { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, ...a }) }).then((x) => x.json());
    return JSON.stringify(r.error ? { error: r.error.message } : { result: r.result });
  } catch (e) {
    return JSON.stringify({ error: e.shortMessage || e.message });
  }
});
await ctx.addInitScript(SHIM);
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.goto(URL + "#race");
await page.waitForFunction(() => document.querySelector("#burnercard")?.innerText.includes("READY"), null, { timeout: 60_000 });
console.log((await page.innerText("#burnercard")).split("\n").slice(2, 8).join(" | "));
await page.click(`#racebook button[data-v="${book}"]`);
await page.click(`#racemode button[data-v="${mode}"]`);
await page.click("#racebtn");
const t0 = Date.now();
let last = "";
while (Date.now() - t0 < 420_000) {
  await page.waitForTimeout(3000);
  const tl = await page.innerText("#timeline");
  const line = tl.split("\n").filter(Boolean).pop();
  if (line !== last) { console.log("  ", line); last = line; }
  if ((await page.innerText("#raceresult")).length > 10 || tl.includes("Stopped")) break;
}
const result = await page.innerText("#raceresult");
console.log("\nRESULT\n" + result);
const runs = await page.evaluate(() => localStorage.getItem("recall.races"));
mkdirSync("evidence", { recursive: true });
const shot = `evidence/ui-race-${book}-${mode}-${Date.now()}.png`;
await page.screenshot({ path: shot, fullPage: true });
if (runs) {
  const r = JSON.parse(runs)[0];
  writeFileSync(`evidence/race-${book}-${mode}-${r.when}.json`, JSON.stringify(r, null, 2));
  console.log("wrote", `evidence/race-${book}-${mode}-${r.when}.json`, shot);
}
console.log("page errors:", errors.length ? errors : "none");
await browser.close();
