// Headless check of the console's Trade page with real transactions: connect (EIP-1193 bridge to a
// local key), post a small ask on the RECALL book with the live signed price, then cancel it.
// Usage: PLAYWRIGHT_DIR=<node_modules> APP_URL=<console url> node scripts/e2e-trade.mjs
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { createRequire } from "node:module";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "../../web/lib/chain.js";

const require = createRequire(import.meta.url);
const { chromium } = require(`${process.env.PLAYWRIGHT_DIR}/playwright`);
const URL = process.env.APP_URL || "http://127.0.0.1:4320/app";
const pk = readFileSync(`${homedir()}/.config/recall/tester.env`, "utf8").match(/^TESTER_PK=(.*)$/m)[1];
const acct = privateKeyToAccount(pk);
const wc = createWalletClient({ account: acct, chain: monadTestnet, transport: http() });

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
await ctx.addInitScript(`window.ethereum = { isMetaMask: true, on() {}, removeListener() {}, request: (a) => window.__rpcBridge(JSON.stringify(a)).then((r) => { const j = JSON.parse(r); if (j.error) throw new Error(j.error); return j.result; }) };`);
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(URL + "#trade");
await page.waitForFunction(() => document.querySelector("#postprice")?.value, null, { timeout: 60_000 });
await page.waitForFunction(() => /MON/.test(document.querySelector(".card.stack")?.innerText || "") && !/Connect to trade/.test(document.body.innerText), null, { timeout: 30_000 });
const acctText = (await page.locator(".card.stack").first().innerText()).replace(/\n/g, " | ");
console.log("account:", acctText.slice(0, 160));
const toasts = () => page.locator("#toast div").allInnerTexts();

await page.fill("#postsize", "0.01");
await page.click("#postbtn");
await page.waitForFunction(() => [...document.querySelectorAll("#toast div")].some((d) => /^Post/.test(d.innerText)), null, { timeout: 90_000 });
console.log("post toast:", (await toasts()).join(" || "));
const row = page.locator("#ordertable tr", { hasText: "you" }).first();
await row.waitFor({ timeout: 30_000 });
const id = (await row.locator("td").first().innerText()).trim();
console.log("my order:", id, (await row.innerText()).replace(/\s+/g, " "));
await row.locator("button", { hasText: "Cancel" }).click();
await page.waitForFunction(() => [...document.querySelectorAll("#toast div")].some((d) => /^Cancel/.test(d.innerText)), null, { timeout: 90_000 });
console.log("cancel toast:", (await toasts()).filter((t) => t.startsWith("Cancel")).join(" || "));
const hrefs = await page.locator("#toast a.tx").evaluateAll((as) => as.map((a) => a.href));
console.log("tx links:", hrefs.join(" "));
console.log("page errors:", errors);
await browser.close();
