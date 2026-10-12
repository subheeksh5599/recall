// Screenshot every console view (desktop + phone) and report horizontal overflow and page errors.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require(`${process.env.PLAYWRIGHT_DIR}/playwright`);
const URL = process.env.APP_URL || "http://127.0.0.1:4319/app/";
const b = await chromium.launch();
for (const [w, h, tag] of [[1440, 900, "d"], [390, 844, "m"]]) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));
  for (const v of ["overview", "trade", "race", "activity", "contracts"]) {
    await p.goto(URL + "#" + v);
    await p.waitForTimeout(7000);
    const ov = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    await p.screenshot({ path: `${process.env.OUT}/${tag}-${v}.png`, fullPage: tag === "d" });
    console.log(tag, v, "overflow", ov);
  }
  console.log(tag, "errors", errs);
}
await b.close();
