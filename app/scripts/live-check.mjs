// Smoke-check the hosted site: landing -> console, chain + price reads, every view, no failed requests.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require(`${process.env.PLAYWRIGHT_DIR}/playwright`);
const U = "https://different-skunk-560.convex.site";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errs = []; p.on("pageerror", (e) => errs.push(String(e))); p.on("response", (r) => r.status() >= 400 && errs.push(r.status() + " " + r.url()));
await p.goto(U + "/"); await p.waitForTimeout(4000);
const href = await p.evaluate(() => [...document.querySelectorAll("a")].filter((a) => /Open Console/i.test(a.innerText)).map((a) => a.getAttribute("href")));
console.log("landing title", await p.title(), "console links", href);
await p.click("text=Open Console >> nth=0"); await p.waitForTimeout(9000);
console.log("url", p.url(), "block", await p.innerText("#blockno"), "price", await p.innerText("#topprice"), "cards", await p.locator("#bookcards .card").count());
console.log("evidence rows", await p.locator("#evidence tbody tr").count());
await p.screenshot({ path: "/home/arch/.hermes/cache/scratch/live-console.png" });
for (const v of ["trade", "race", "activity", "contracts"]) { await p.goto(U + "/app/index.html#" + v); await p.waitForTimeout(5000); console.log(v, (await p.innerText(".view.active")).slice(0, 80).replace(/\n/g, " | ")); }
console.log("errors", errs);
await b.close();
