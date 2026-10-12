import { useEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";

/* Deterministic in-browser model of the rule. Not chain data. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function simulate({ mode, dodge, seed, rounds = 100, half = 10, stale = 25, vol = 22 }) {
  const r = rng(seed);
  const gauss = () => Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());
  const cells = [];
  let sniperBps = 0, makerLost = 0, makerEarned = 0, fairArrived = 0, fairFilled = 0, refused = 0, dodgesBlocked = 0;
  for (let i = 0; i < rounds; i++) {
    const move = gauss() * vol;
    const fair = r() < 0.55;
    const tryDodge = fair && r() < dodge;
    const sniperWinsRace = r() < 0.92; // higher fee usually lands first, not always
    const dodgeWinsRace = r() < 0.5;
    let kind = "quiet";
    if (Math.abs(move) > half) {
      // sniper and maker both react to the move
      const gain = Math.abs(move) - half;
      const protectedByRule = mode === "recall" && Math.abs(move) >= stale;
      if (protectedByRule) { kind = "cancel"; refused++; }
      else if (mode === "ordinary" && !sniperWinsRace) { kind = "cancel"; }
      else { kind = "sniped"; sniperBps += gain; makerLost += gain; }
    } else if (fair) {
      fairArrived++;
      if (tryDodge && mode === "ordinary" && dodgeWinsRace) { kind = "dodged"; }
      else {
        if (tryDodge && mode === "recall") dodgesBlocked++;
        kind = tryDodge ? "dodgefail" : "fill";
        fairFilled++; makerEarned += half;
      }
    }
    cells.push({ kind, move });
  }
  const breakeven = fairFilled ? half + makerLost / fairFilled : 0;
  return { cells, sniperBps, makerLost, makerEarned, fairArrived, fairFilled, refused, dodgesBlocked, breakeven, half };
}

const COLORS = {
  sniped: { bg: "#e42b0c", fg: "#fff", label: "Sniped stale quote" },
  cancel: { bg: "#101828", fg: "#fff", label: "Stale quote pulled in time" },
  fill: { bg: "#ffffff", fg: "#101828", label: "Fair trade filled" },
  dodgefail: { bg: "#ffffff", fg: "#e42b0c", label: "Dodge refused, trade filled" },
  dodged: { bg: "#ffb59f", fg: "#101828", label: "Fair trade dodged by maker" },
  quiet: { bg: "#efefef", fg: "#99a1af", label: "No trade" },
};

function Counter({ value, format = (v) => v.toFixed(0), className = "" }) {
  const el = useRef(null);
  const prev = useRef(0);
  useEffect(() => {
    const o = { v: prev.current };
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { el.current.textContent = format(value); prev.current = value; return; }
    const t = gsap.to(o, { v: value, duration: 0.9, ease: "power3.out", onUpdate: () => { if (el.current) el.current.textContent = format(o.v); } });
    prev.current = value;
    return () => t.kill();
  }, [value]);
  return <span ref={el} className={className}>{format(value)}</span>;
}

export default function Simulator() {
  const [mode, setMode] = useState("recall");
  const [dodge, setDodge] = useState(0.5);
  const [seed, setSeed] = useState(7);
  const grid = useRef(null);

  const res = useMemo(() => simulate({ mode, dodge, seed }), [mode, dodge, seed]);
  const other = useMemo(() => simulate({ mode: mode === "recall" ? "ordinary" : "recall", dodge, seed }), [mode, dodge, seed]);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const cells = grid.current?.children;
    if (!cells) return;
    gsap.fromTo(cells, { scale: 0.4 }, { scale: 1, duration: 0.35, ease: "back.out(2)", stagger: { each: 0.006, from: "start" } });
  }, [mode, seed]);

  const legendKinds = mode === "recall" ? ["sniped", "cancel", "fill", "dodgefail", "quiet"] : ["sniped", "cancel", "fill", "dodged", "quiet"];

  return (
    <div className="card overflow-hidden">
      <div className="grid lg:grid-cols-[1.05fr_1fr]">
        <div className="p-6 sm:p-10">
          <div className="text-[56px] leading-none text-vermillion" aria-hidden="true">“</div>
          <p className="h-sm -mt-4 text-slate-900">
            Don't take a market maker's word for it. <span className="text-steel">Run a hundred price shocks and read what the rule did to each one.</span>
          </p>
          <p className="cap mt-4 max-w-[460px]">
            Same seed, same price path, same traders. Flip the book between an ordinary fee-ordered book and RECALL. Every square is one round.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-[8px] border border-cloud bg-vellum p-1" role="tablist" aria-label="Book type">
              {[["ordinary", "Ordinary book"], ["recall", "RECALL"]].map(([k, l]) => (
                <button key={k} role="tab" aria-selected={mode === k} onClick={() => setMode(k)}
                  className={`rounded-[6px] px-4 py-2 text-[13px] font-medium uppercase tracking-[.025em] transition-colors ${mode === k ? (k === "recall" ? "bg-vermillion text-white" : "bg-carbon text-white") : "text-slate-600 hover:text-slate-900"}`}>
                  {l}
                </button>
              ))}
            </div>
            <button onClick={() => setSeed((s) => s + 1)} className="btn btn-ghost !py-[11px]">New price path <span className="mono text-[11px] text-iron">#{seed}</span></button>
          </div>

          <label className="mt-6 block">
            <span className="eyebrow">Maker tries to dodge fair trades · {Math.round(dodge * 100)}% of the time</span>
            <input type="range" min="0" max="1" step="0.05" value={dodge} onChange={(e) => setDodge(+e.target.value)}
              className="mt-3 w-full max-w-[420px] accent-[#e42b0c]" aria-label="Dodge rate" />
          </label>

          <div className="mt-8 grid grid-cols-3 gap-4 border-t border-frost pt-6">
            <div>
              <div className="text-[44px] font-light leading-none tracking-[-0.025em] text-slate-900 sm:text-[56px]">
                <Counter value={res.sniperBps} />
              </div>
              <div className="cap mt-2">bps taken by the sniper <span className="mono block text-[12px] text-iron">other book: {other.sniperBps.toFixed(0)}</span></div>
            </div>
            <div>
              <div className="text-[44px] font-light leading-none tracking-[-0.025em] text-slate-900 sm:text-[56px]">
                <Counter value={res.fairArrived ? (res.fairFilled / res.fairArrived) * 100 : 0} />%
              </div>
              <div className="cap mt-2">fair trades filled <span className="mono block text-[12px] text-iron">other book: {other.fairArrived ? Math.round((other.fairFilled / other.fairArrived) * 100) : 0}%</span></div>
            </div>
            <div>
              <div className="text-[44px] font-light leading-none tracking-[-0.025em] text-slate-900 sm:text-[56px]">
                <Counter value={res.breakeven} format={(v) => v.toFixed(1)} />
              </div>
              <div className="cap mt-2">bps half-spread to break even <span className="mono block text-[12px] text-iron">other book: {other.breakeven.toFixed(1)}</span></div>
            </div>
          </div>
        </div>

        <div className="relative bg-carbon p-6 sm:p-10">
          <div className="flex items-center justify-between">
            <span className="panel-lbl mono text-[11px] uppercase tracking-[.08em] text-[#9a9a9a]">100 rounds · seed {seed}</span>
            <span className={`mono rounded-[6px] px-2 py-1 text-[11px] uppercase tracking-[.08em] ${mode === "recall" ? "bg-vermillion text-white" : "bg-white text-black"}`}>{mode === "recall" ? "RECALL" : "Ordinary"}</span>
          </div>
          <div ref={grid} className="mt-5 grid grid-cols-10 gap-[5px]" aria-label="Outcome of each simulated round">
            {res.cells.map((c, i) => {
              const s = COLORS[c.kind];
              return (
                <div key={i} title={`Round ${i + 1}: ${s.label} (move ${c.move >= 0 ? "+" : ""}${c.move.toFixed(0)} bps)`}
                  className="aspect-square rounded-[4px]"
                  style={{ background: s.bg, boxShadow: c.kind === "dodgefail" ? "inset 0 0 0 2px #e42b0c" : undefined }} />
              );
            })}
          </div>
          <ul className="mt-6 grid grid-cols-2 gap-x-4 gap-y-2">
            {legendKinds.map((k) => (
              <li key={k} className="flex items-center gap-2 text-[12px] text-[#cfcfcf]">
                <span className="inline-block h-3 w-3 rounded-[3px]" style={{ background: COLORS[k].bg, boxShadow: k === "dodgefail" ? "inset 0 0 0 2px #e42b0c" : undefined }} />
                {COLORS[k].label}
              </li>
            ))}
          </ul>
          <p className="mt-6 border-t border-[#333] pt-4 text-[12px] leading-[1.6] text-[#9a9a9a]">
            Model, not chain data: moves drawn from a fixed seed, 10 bps half-spread, stale at 25 bps, the higher-fee sender lands first 92% of the time on the ordinary book. Moves between 10 and 25 bps still get sniped on RECALL. That is the threshold trade-off, shown on purpose. Testnet numbers replace this after deployment.
          </p>
        </div>
      </div>
    </div>
  );
}
