"use client";
import { ADDR } from "@/lib/chain.js";
import { S, BOOKS, NAME, useStore } from "./store";
import { Addr, Card } from "./ui";

function KV({ title, rows }) {
  return (
    <Card eyebrow="Contract" title={title}>
      <dl className="kv">
        {rows.map(([k, v]) => [<dt key={k + "t"}>{k}</dt>, <dd key={k + "d"}>{v}</dd>])}
      </dl>
    </Card>
  );
}

export default function Contracts() {
  useStore();
  const o = S.oracle;
  const bk = (k) => {
    const c = S.books[k]?.cfg || {};
    const s = (x) => (x === undefined ? "—" : String(x));
    return (
      <KV key={k} title={`${NAME[k]} book`} rows={[
        ["Address", <Addr a={BOOKS[k]}>{BOOKS[k]}</Addr>],
        ["Cancel-first", s(c.cancelFirst)],
        ["Delay", `${s(c.delay)} blocks`],
        ["Stale threshold", `${s(c.staleBps)} bps`],
        ["Settled per call", s(c.workCap)],
        ["Takes per block", s(c.maxPerBlock)],
        ["Base", <Addr a={ADDR.wmon}>WMON</Addr>],
        ["Quote", <Addr a={ADDR.usd}>tUSD</Addr>],
      ]} />
    );
  };
  return (
    <div className="grid g2" id="contractcards">
      {bk("recall")}
      {bk("plain")}
      <KV title="Signed price" rows={[
        ["Address", <Addr a={ADDR.oracle}>{ADDR.oracle}</Addr>],
        ["Feed", "MON / USD"],
        ["Threshold", o ? `${o.threshold} of ${o.signers.length} signers` : "—"],
        ["Max age", o ? `${o.maxAge} s` : "—"],
        ["Signers", o ? o.signers.map((x) => <div key={x}><Addr a={x}>{x}</Addr></div>) : "—"],
      ]} />
      <KV title="Quote token" rows={[
        ["Address", <Addr a={ADDR.usd}>{ADDR.usd}</Addr>],
        ["Symbol", "tUSD"],
        ["Supply rule", "1,000 per address per hour, no owner"],
        ["Source", <a className="tx" href="https://github.com/subheeksh5599/recall/tree/main/contracts" target="_blank" rel="noreferrer">contracts/</a>],
        ["Verified", <a className="tx" href={`https://sourcify.dev/server/v2/contract/10143/${ADDR.recall}`} target="_blank" rel="noreferrer">exact match</a>],
      ]} />
    </div>
  );
}
