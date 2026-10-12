import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import HeroScene from "./HeroScene.jsx";
import Simulator from "./Simulator.jsx";
import { Arrow, LINKS, Mark, Wordmark } from "./ui.jsx";

gsap.registerPlugin(ScrollTrigger);

function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll(".rv");
    const io = new IntersectionObserver(
      (es) => es.forEach((e) => e.isIntersecting && (e.target.classList.add("in"), io.unobserve(e.target))),
      { rootMargin: "0px 0px -8% 0px" }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

/* ---------------- NAV ---------------- */
function Nav() {
  const items = [["Rule", "#rule"], ["Mechanism", "#mechanism"], ["Why Monad", "#monad"], ["Proof", "#proof"], ["Attacks", "#attacks"]];
  return (
    <header className="nav">
      <div className="shell flex h-16 items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <a href="#top" aria-label="RECALL home"><Wordmark /></a>
          <span className="pill hidden xl:inline-flex">Cancel-first book</span>
        </div>
        <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary">
          {items.map(([l, h]) => <a key={h} className="item" href={h}>{l}</a>)}
        </nav>
        <div className="flex items-center gap-2">
          <a className="btn btn-ghost hidden !py-[10px] sm:inline-flex" href={LINKS.repo} target="_blank" rel="noreferrer">GitHub</a>
          <a className="btn btn-gradient !px-3 sm:!px-[18px]" href={LINKS.spec} target="_blank" rel="noreferrer"><span className="hidden sm:inline">Read the spec</span><span className="sm:hidden">Spec</span> <Arrow /></a>
        </div>
      </div>
    </header>
  );
}

/* ---------------- HERO ---------------- */
function Hero() {
  const root = useRef(null);
  useGSAP(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.from("[data-h]", { y: 24, duration: 1, ease: "power3.out", stagger: 0.08 });
  }, { scope: root });
  return (
    <section id="top" className="shell pt-6" ref={root}>
      <div className="card grid items-center gap-10 p-6 sm:p-10 lg:grid-cols-[0.82fr_1fr] lg:p-12">
        <div>
          <span data-h className="pill"><span className="dot" />Order book · Monad</span>
          <h1 data-h className="display mt-6">The order book snipers can't front-run.</h1>
          <p data-h className="lede mt-6 max-w-[480px]">
            Trades wait one block. Cancels don't. A cancel only jumps the queue when a signed price proves the quote went stale, so snipers lose and fair customers still get filled.
          </p>
          <div data-h className="mt-8 flex flex-wrap gap-3">
            <a className="btn btn-signal" href="#proof">Run the rule <Arrow /></a>
            <a className="btn btn-ghost" href={LINKS.evidence} target="_blank" rel="noreferrer">See the evidence</a>
          </div>
          <dl data-h className="mt-10 grid max-w-[480px] grid-cols-3 gap-4 border-t border-frost pt-6">
            {[["1 block", "trade delay"], ["≈0.4 s", "per Monad block"], ["0", "chain changes"]].map(([a, b]) => (
              <div key={b}><dt className="mono text-[20px] text-slate-900">{a}</dt><dd className="cap">{b}</dd></div>
            ))}
          </dl>
        </div>
        <div data-h><HeroScene /></div>
      </div>
    </section>
  );
}

/* ---------------- RULE TICKER (trust bar) ---------------- */
function Ticker() {
  const words = ["Trades wait one block", "Cancels land now", "Signed-price gate", "Oldest trade settles first", "Bounded work per call", "Per-block queue cap", "Funds in = funds out", "No chain changes"];
  const row = [...words, ...words];
  return (
    <section className="mt-16 border-y border-frost bg-white py-8" aria-label="The rule at a glance">
      <div className="shell mb-5"><span className="eyebrow">Enforced by one contract, read by anyone</span></div>
      <div className="marquee">
        <div className="marquee-track">
          {row.map((w, i) => (
            <span key={i} className="flex items-center gap-10 pr-10 text-[22px] font-light tracking-[-0.01em] text-slate-700">
              {w}<span className="text-vermillion" aria-hidden="true">✳</span>
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------------- RULE (badges section) ---------------- */
function Shield({ n, title, line }) {
  return (
    <div className="rv flex flex-col items-center text-center">
      <svg width="112" height="128" viewBox="0 0 112 128" aria-hidden="true">
        <path d="M56 4 104 20v44c0 30-22 50-48 60C30 114 8 94 8 64V20Z" fill="#fff" stroke="#d4d4d4" strokeWidth="1.5" />
        <path d="M56 14 94 27v37c0 24-17 40-38 48-21-8-38-24-38-48V27Z" fill={n === 2 ? "#e42b0c" : "#101828"} />
        <text x="56" y="62" textAnchor="middle" fill="#fff" fontFamily="Geist Mono Variable, monospace" fontSize="11" letterSpacing="1.2">RULE</text>
        <text x="56" y="88" textAnchor="middle" fill="#fff" fontFamily="Geist Variable, sans-serif" fontSize="26" fontWeight="300">0{n}</text>
      </svg>
      <div className="mt-3 text-[16px] font-medium text-slate-900">{title}</div>
      <div className="cap mt-1 max-w-[200px]">{line}</div>
    </div>
  );
}

function Rule() {
  return (
    <section id="rule" className="shell mt-16">
      <div className="grid items-center gap-10 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="rv">
          <span className="eyebrow">The rule in one line</span>
          <h2 className="h-md mt-4">Snipers lose. Fair customers still get filled.</h2>
          <p className="lede mt-4 max-w-[440px]">Four lines of order-book policy, each one enforced in the contract and each one covered by its own test.</p>
          <a className="btn btn-carbon mt-8" href={LINKS.spec} target="_blank" rel="noreferrer">Read the full rule <Arrow /></a>
        </div>
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
          <Shield n={1} title="Quotes are instant" line="Post, amend and cancel apply the moment they land." />
          <Shield n={2} title="Trades wait" line="A take from block N is queued, not matched." />
          <Shield n={3} title="Oldest first" line="Every call settles takes from blocks ≤ N − D before acting." />
          <Shield n={4} title="Only stale cancels win" line="A signed price must show the quote moved past the threshold." />
        </div>
      </div>
    </section>
  );
}

/* ---------------- MECHANISM (feature cards) ---------------- */
function QueueArt() {
  return (
    <div className="relative h-[180px] overflow-hidden rounded-[8px] bg-[linear-gradient(160deg,#ff7802,#e42b0c)] p-5">
      <div className="absolute inset-x-5 top-6 space-y-2">
        {["CANCEL  ·  applied now", "POST  ·  applied now", "TAKE  ·  queued → N+1", "TAKE  ·  queued → N+1"].map((t, i) => (
          <div key={t} className={`mono flex items-center justify-between rounded-[6px] px-3 py-2 text-[11px] ${i < 2 ? "bg-white text-slate-900" : "bg-black/25 text-white"}`}
            style={{ transform: `translateX(${i * 6}px)` }}>
            <span>{t.split("·")[0]}</span><span className="opacity-70">{t.split("·")[1]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
function GateArt() {
  return (
    <div className="relative h-[180px] overflow-hidden rounded-[8px] bg-[#fff1ec] p-5">
      <div className="rounded-[8px] border border-[#ffb59f] bg-white p-4 shadow-[var(--shadow-subtle)]">
        <div className="mono flex justify-between text-[11px] text-slate-600"><span>postPrice</span><span>100.00</span></div>
        <div className="mono mt-1 flex justify-between text-[11px] text-slate-600"><span>cancelPrice</span><span>100.62</span></div>
        <div className="my-2 h-px bg-frost" />
        <div className="mono flex justify-between text-[12px] text-slate-900"><span>|Δ| / post</span><span>62 bps</span></div>
        <div className="mono mt-1 flex justify-between text-[12px] text-slate-900"><span>staleBps</span><span>25 bps</span></div>
      </div>
      <span className="stamp absolute bottom-4 right-4 rotate-[-3deg]">Stale ✓ cancel wins</span>
    </div>
  );
}
function BoundArt() {
  const bars = [9, 9, 9, 9, 6, 0, 0];
  return (
    <div className="relative h-[180px] overflow-hidden rounded-[8px] bg-carbon p-5">
      <div className="mono text-[10px] uppercase tracking-[.08em] text-[#9a9a9a]">settled per call · capped</div>
      <div className="mt-4 flex h-[96px] items-end gap-2">
        {bars.map((b, i) => (
          <div key={i} className="flex-1 rounded-t-[4px]" style={{ height: `${Math.max(b, 0.6) * 10}px`, background: b === 9 ? "#e42b0c" : b ? "#ff7a5c" : "#333" }} />
        ))}
      </div>
      <div className="mt-2 border-t border-dashed border-[#555] pt-2 text-[11px] text-[#cfcfcf]">cap reached → new takes refused, cancels still run</div>
    </div>
  );
}

function Mechanism() {
  const cards = [
    { t: "Cancel-first queue", d: "Posts and cancels apply in the block they land. Takes wait D blocks, so a maker's cancel always reaches the book before a sniper's take, whatever fee the sniper pays.", art: <QueueArt />, href: LINKS.loop },
    { t: "Price-gated cancel", d: "A cancel only beats a waiting take if its signed price moved past the market's threshold since the quote was posted. No move, no jump: the fair trade fills.", art: <GateArt />, href: LINKS.spec },
    { t: "Bounded settlement", d: "Each call settles a capped amount of old work, oldest first. Gas stays predictable and nobody can stuff the queue to stall everyone else.", art: <BoundArt />, href: LINKS.loop },
  ];
  return (
    <section id="mechanism" className="shell mt-24">
      <div className="rv mx-auto max-w-[760px] text-center">
        <span className="eyebrow">Mechanism</span>
        <h2 className="h-lg mt-4">Fair fills for a sub-second chain</h2>
        <p className="lede mx-auto mt-4 max-w-[640px]">Three parts, one contract. A switch turns the rule off so the same code runs as an ordinary book and the difference can be measured.</p>
      </div>
      <div className="mt-12 grid gap-6 md:grid-cols-3">
        {cards.map((c) => (
          <article key={c.t} className="rv card card-hover flex flex-col p-6">
            <div className="flex items-center gap-2 text-slate-600"><Mark size={18} /><span className="eyebrow">Part</span></div>
            <h3 className="sub mt-3 text-slate-900">{c.t}</h3>
            <p className="body mt-2 flex-1">{c.d}</p>
            <a className="mt-4 inline-flex items-center gap-2 text-[14px] text-slate-600 hover:text-slate-900" href={c.href} target="_blank" rel="noreferrer">Learn more <Arrow /></a>
            <div className="mt-6">{c.art}</div>
          </article>
        ))}
      </div>
    </section>
  );
}

/* ---------------- WHY MONAD (dark stats) ---------------- */
function Monad() {
  const root = useRef(null);
  useGSAP(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    root.current.querySelectorAll("[data-count]").forEach((el) => {
      const end = parseFloat(el.dataset.count);
      const dec = +(el.dataset.dec || 0);
      const o = { v: 0 };
      gsap.to(o, { v: end, duration: 1.4, ease: "power2.out", scrollTrigger: { trigger: el, start: "top 85%", once: true },
        onUpdate: () => (el.textContent = o.v.toFixed(dec)) });
    });
  }, { scope: root });
  const stats = [
    { n: 0.4, dec: 1, pre: "≈", suf: " s", l: "Monad block time: a one-block wait is barely felt", src: LINKS.gas },
    { n: 12, dec: 0, pre: "", suf: " s", l: "the same wait on a 12-second chain: unusable", src: "https://github.com/subheeksh5599/recall#why-monad" },
    { n: 20, dec: 0, pre: "≈", suf: "%", l: "of volume is sniping in the markets studied", src: LINKS.research },
    { n: 33, dec: 0, pre: "17–", suf: "%", l: "of the cost of liquidity comes from sniping", src: LINKS.research },
    { n: 0, dec: 0, pre: "", suf: "", l: "documented Monad order books where a cancel beats a waiting take", src: LINKS.book },
  ];
  return (
    <section id="monad" className="shell mt-24" ref={root}>
      <div className="rounded-[8px] bg-carbon p-6 text-white sm:p-10 lg:p-12">
        <div className="grid gap-8 lg:grid-cols-[1fr_auto]">
          <div className="rv">
            <span className="eyebrow !text-[#9a9a9a]">Why Monad</span>
            <h2 className="h-lg mt-4 max-w-[640px] text-white">A rule old exchanges paid for, finally cheap enough to run in a contract</h2>
            <p className="mt-4 max-w-[600px] text-[18px] leading-[1.5] text-[#bdbdbd]">
              Fee priority is Monad's default ordering and fees are charged on the gas limit. Fast blocks make the wait cheap; capped settlement keeps the fee predictable.
            </p>
          </div>
          <div className="rv hidden h-[88px] w-[88px] items-center justify-center rounded-[8px] border border-[#333] lg:flex">
            <span className="mono text-center text-[11px] leading-tight text-[#9a9a9a]">MIT<br />OPEN<br />SOURCE</span>
          </div>
        </div>
        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {stats.map((s) => (
            <a key={s.l} href={s.src} target="_blank" rel="noreferrer" className="rv stat-cell group block transition-colors hover:border-vermillion">
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" className="text-[#ff7a5c]"><path d="M7 12V2M3 6l4-4 4 4" stroke="currentColor" strokeWidth="1.6" fill="none" /></svg>
              <div className="mt-6 text-[34px] font-light tracking-[-0.025em]">{s.pre}<span data-count={s.n} data-dec={s.dec}>{s.n.toFixed(s.dec)}</span>{s.suf}</div>
              <div className="mt-2 text-[12px] uppercase leading-[1.5] tracking-[.025em] text-[#9a9a9a]">{s.l}</div>
              <div className="mt-3 text-[11px] text-[#777] group-hover:text-white">source ↗</div>
            </a>
          ))}
        </div>
        <div className="mt-8 flex flex-wrap justify-end gap-3">
          <a className="btn btn-light !py-[11px]" href={LINKS.spec} target="_blank" rel="noreferrer">Read the spec <Arrow /></a>
          <a className="btn btn-ghost-dark !py-[11px]" href={LINKS.evidence} target="_blank" rel="noreferrer">See all sources <Arrow /></a>
        </div>
      </div>
    </section>
  );
}

/* ---------------- WHERE ENFORCED (ecosystem grid) ---------------- */
function Enforced() {
  const rows = [
    ["Take path", ["queue(take)", "never same-block", "N + D"]],
    ["Cancel path", ["verify(sig)", "maxAge", "staleBps"]],
    ["Settlement", ["oldest first", "per-call cap", "per-block cap"]],
  ];
  return (
    <section className="shell mt-24">
      <div className="card grid items-center gap-10 p-6 sm:p-10 lg:grid-cols-2">
        <div className="rv">
          <span className="eyebrow">Where the guarantee lives</span>
          <h2 className="h-md mt-4">No keeper, no vote, no model</h2>
          <p className="lede mt-4 max-w-[460px]">"Stale" is arithmetic over two signed prices and a threshold. Every guarantee sits on a code path anyone can read and a test anyone can run.</p>
          <a className="btn btn-carbon mt-8" href={LINKS.repo} target="_blank" rel="noreferrer">Open the repo <Arrow /></a>
        </div>
        <div className="rv grid gap-2">
          {rows.map(([k, cells]) => (
            <div key={k} className="grid grid-cols-[120px_1fr] gap-2">
              <div className="panel flex items-center justify-center p-3 text-[14px]">{k}</div>
              <div className="frame-grid grid-cols-3 !border">
                {cells.map((c) => <div key={c} className="cell h-14 bg-white !text-[12px] last:border-r-0">{c}</div>)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------------- PROOF (simulator replaces testimonials) ---------------- */
function Proof() {
  return (
    <section id="proof" className="shell mt-24">
      <div className="rv mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="eyebrow">Proof, not testimonials</span>
          <h2 className="h-lg mt-4">Watch the rule decide</h2>
        </div>
        <a className="btn btn-ghost" href={LINKS.spec} target="_blank" rel="noreferrer">The demo plan <Arrow /></a>
      </div>
      <div className="rv"><Simulator /></div>
    </section>
  );
}

/* ---------------- ATTACKS (vertical accordion) ---------------- */
const ATTACKS = [
  { t: "Fee race", a: "Sniper pays 50× the fee to beat a stale-price cancel.", r: "Cancel wins, the take finds nothing.", glyph: "50×" },
  { t: "Dodge", a: "Maker sees a waiting fair trade and cancels with no price move.", r: "Take fills; the cancel applies after it.", glyph: "↯" },
  { t: "Forged price", a: "Maker forges or replays a signed price.", r: "Cancel rejected.", glyph: "✕" },
  { t: "Old price", a: "Maker attaches a signed price past its age limit.", r: "Rejected past maxAge.", glyph: "⧗" },
  { t: "Queue flood", a: "Someone floods a block's queue to stall settlement.", r: "The per-block cap refuses the excess.", glyph: "≋" },
  { t: "Backlog", a: "Settlement backlog grows past the per-call cap.", r: "New takes refused until cleared; cancels still work.", glyph: "▤" },
  { t: "Dropped cancel", a: "A block producer drops the cancel from one block.", r: "With D = 2, a cancel in the next block still lands first.", glyph: "D2" },
];

function Attacks() {
  const [open, setOpen] = useState(0);
  const panel = useRef(null);
  useEffect(() => {
    if (!panel.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.fromTo(panel.current.querySelectorAll("[data-a]"), { y: 14, opacity: 0.3 }, { y: 0, opacity: 1, duration: 0.5, ease: "power3.out", stagger: 0.05 });
  }, [open]);
  const at = ATTACKS[open];
  return (
    <section id="attacks" className="shell mt-24">
      <div className="rv mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="eyebrow">Attack → test</span>
          <h2 className="h-md mt-4">Seven ways to break it. One test for each.</h2>
        </div>
        <a className="btn btn-carbon" href={LINKS.attacks} target="_blank" rel="noreferrer">See the table <Arrow /></a>
      </div>

      {/* desktop: horizontal accordion with vertical tabs */}
      <div className="rv hidden h-[470px] gap-2 md:flex">
        {ATTACKS.map((x, i) =>
          i === open ? (
            <div key={x.t} ref={panel} className="card flex min-w-0 flex-1 gap-6 p-8">
              <div className="flex w-[46%] flex-col">
                <div data-a className="flex items-center justify-between">
                  <span className="sub text-slate-900">{x.t}</span>
                  <span className="mono text-[12px] text-iron">0{i + 1} / 07</span>
                </div>
                <p data-a className="body mt-4"><span className="eyebrow block">Attack</span>{x.a}</p>
                <p data-a className="mt-4 text-[18px] leading-[1.5] text-slate-900"><span className="eyebrow block">What must happen</span>{x.r}</p>
                <div data-a className="mt-auto"><span className="pill"><span className="h-[6px] w-[6px] rounded-[2px] border border-vermillion" />Test planned · not yet written</span></div>
              </div>
              <div data-a className="relative flex flex-1 items-center justify-center overflow-hidden rounded-[8px] bg-carbon">
                <div className="grid grid-cols-3 gap-x-1 gap-y-3 p-6 -translate-y-[22px]">
                  {[0, 1, 2, 3, 4, 5].map((k) => (
                    <div key={k} className={`hex flex h-[84px] w-[96px] items-center justify-center ${k === 4 ? "bg-vermillion" : "bg-[#3a3a3a]"} ${k % 2 ? "translate-y-[44px]" : ""}`}>
                      <span className={`mono text-[22px] ${k === 4 ? "text-white" : "text-[#8a8a8a]"}`}>{k === 4 ? x.glyph : ["✳", "◇", "▲", "○", "", "□"][k]}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <button key={x.t} onClick={() => setOpen(i)} aria-label={`Show attack: ${x.t}`}
              className="card card-hover flex w-[62px] shrink-0 flex-col items-center justify-start gap-6 py-5">
              <span className="mono text-[11px] text-iron">0{i + 1}</span>
              <span className="vtab whitespace-nowrap">{x.t}</span>
            </button>
          )
        )}
      </div>

      {/* mobile: stacked list */}
      <div className="grid gap-2 md:hidden">
        {ATTACKS.map((x, i) => (
          <details key={x.t} className="card p-5" open={i === 0}>
            <summary className="flex cursor-pointer items-center justify-between text-[18px] text-slate-900">{x.t}<span className="mono text-[11px] text-iron">0{i + 1}</span></summary>
            <p className="body mt-3">{x.a}</p>
            <p className="mt-2 text-[16px] text-slate-900">{x.r}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

/* ---------------- HONESTY ---------------- */
function Honesty() {
  const rows = [
    ["The rule as specified", "Written, not implemented"],
    ["Snipers lose on RECALL", "Not yet shown on chain"],
    ["Fair trades still fill", "Not yet shown on chain"],
    ["Makers can quote tighter", "Not yet measured"],
    ["Stale-quote loss on a live Monad book", "Not yet measured"],
    ["Beats a colluding block producer", "Not claimed"],
  ];
  return (
    <section className="shell mt-24">
      <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="rv">
          <span className="eyebrow">Live status</span>
          <h2 className="h-md mt-4">What's real, and what isn't yet</h2>
          <p className="lede mt-4">Each row changes only when a transaction or a test exists to point at.</p>
        </div>
        <div className="rv card divide-y divide-frost">
          {rows.map(([a, b]) => (
            <div key={a} className="flex items-center justify-between gap-4 px-6 py-4">
              <span className="text-[16px] text-slate-900">{a}</span>
              <span className={`mono shrink-0 text-[12px] uppercase tracking-[.025em] ${b === "Not claimed" ? "text-slate-600" : "text-[var(--vermillion-text)]"}`}>{b}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------------- CTA BAND + FOOTER ---------------- */
function Band() {
  return (
    <section className="band mt-24 py-20 text-center text-white">
      <div className="shell">
        <h2 className="mx-auto max-w-[820px] text-[clamp(36px,5vw,60px)] font-light leading-[1.05] tracking-[-0.025em]">The last cancel race your quotes will ever lose</h2>
        <p className="mt-4 text-[18px] text-white/85">Stop paying snipers. Start quoting tighter.</p>
        <a className="btn btn-carbon mt-8" href={LINKS.repo} target="_blank" rel="noreferrer">Star the repo <Arrow /></a>
      </div>
    </section>
  );
}

function Footer() {
  const cols = [
    ["Product", [["The rule", LINKS.spec], ["Settlement loop", LINKS.loop], ["Attack table", LINKS.attacks]]],
    ["Proof", [["Evidence", LINKS.evidence], ["Simulator", "#proof"], ["Live status", LINKS.repo]]],
    ["Build", [["Repository", LINKS.repo], ["License (MIT)", LINKS.license]]],
  ];
  return (
    <footer className="bg-white pt-16">
      <div className="shell grid gap-10 border-b border-frost pb-12 md:grid-cols-[1.2fr_repeat(3,1fr)]">
        <div>
          <Wordmark />
          <p className="cap mt-4 max-w-[280px]">An order book on Monad where pulling a stale quote beats the sniper, and only a stale quote.</p>
          <a className="btn btn-signal mt-6" href={LINKS.repo} target="_blank" rel="noreferrer">Watch on GitHub <Arrow /></a>
        </div>
        {cols.map(([h, ls]) => (
          <div key={h}>
            <div className="eyebrow">{h}</div>
            <ul className="mt-4 space-y-2">
              {ls.map(([l, u]) => (
                <li key={l}><a className="text-[14px] text-slate-700 hover:text-vermillion" href={u} {...(u.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : {})}>{l}</a></li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="shell flex flex-wrap items-center justify-between gap-2 py-6 text-[12px] text-iron">
        <span>© 2026 subheeksh5599 · MIT</span>
        <span className="mono">Status: design stage · Monad testnet next</span>
      </div>
    </footer>
  );
}

export default function App() {
  useReveal();
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <Ticker />
        <Rule />
        <Mechanism />
        <Monad />
        <Enforced />
        <Proof />
        <Attacks />
        <Honesty />
        <Band />
      </main>
      <Footer />
    </>
  );
}
