import { useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

const LANES = ["BLOCK N", "BLOCK N+1", "BLOCK N+2"];
const LADDER = [
  ["100.40", "c1", 3],
  ["100.30", "c1", 5],
  ["100.20", "c2", 8],
  ["100.10", "c3", 12],
  ["100.00", "c4", 20],
];

/* Looping hero scene: act 1 = stale quote, sniper loses; act 2 = fair trade, dodge refused. */
export default function HeroScene() {
  const root = useRef(null);
  const [act, setAct] = useState(1);

  useGSAP(
    () => {
      const q = (s) => root.current.querySelector(s);
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const price = { v: 100.0 };
      const priceEl = q("[data-price]");
      const moveEl = q("[data-move]");
      const setPrice = () => {
        priceEl.textContent = price.v.toFixed(2);
        const bps = Math.round(((price.v - 100) / 100) * 10000);
        moveEl.textContent = `${bps >= 0 ? "+" : ""}${bps} bps`;
        moveEl.style.color = Math.abs(bps) >= 25 ? "#ff7a5c" : "#9a9a9a";
      };
      setPrice();
      if (reduce) return;

      const tl = gsap.timeline({ repeat: -1, repeatDelay: 0.6, defaults: { ease: "power3.out" } });
      const reset = () => {
        gsap.set(["[data-take]", "[data-cancel]", "[data-stamp]", "[data-fair]", "[data-dodge]", "[data-stamp2]"], { autoAlpha: 0, x: 0, y: 0, scale: 1 });
        gsap.set("[data-quote]", { autoAlpha: 1, backgroundColor: "#e42b0c" });
        gsap.set("[data-sweep]", { scaleX: 0 });
        gsap.set("[data-wire]", { strokeDashoffset: 1 });
      };

      tl.call(() => { setAct(1); reset(); price.v = 100.0; setPrice(); })
        // price jumps
        .to(price, { v: 100.62, duration: 1.1, ease: "power2.inOut", onUpdate: setPrice })
        .to("[data-quote]", { backgroundColor: "#ff6a3d", duration: 0.3 }, "<0.6")
        // sniper take arrives with 50x fee, gets queued in block N
        .fromTo("[data-take]", { autoAlpha: 0, x: -60 }, { autoAlpha: 1, x: 0, duration: 0.6 }, "+=0.1")
        // maker cancel arrives, signed price attached, applies instantly
        .fromTo("[data-cancel]", { autoAlpha: 0, x: -60 }, { autoAlpha: 1, x: 0, duration: 0.6 }, "-=0.2")
        .to("[data-wire]", { strokeDashoffset: 0, duration: 0.7, ease: "power2.inOut" })
        .to("[data-quote]", { autoAlpha: 0.15, duration: 0.35 }, "-=0.2")
        // block advances
        .to("[data-sweep]", { scaleX: 1, duration: 0.9, ease: "none" })
        .to("[data-take]", { x: 150, duration: 0.6, ease: "power2.in" }, "-=0.5")
        .to("[data-take]", { autoAlpha: 0.35, duration: 0.2 })
        .fromTo("[data-stamp]", { autoAlpha: 0, scale: 1.25, rotate: -6 }, { autoAlpha: 1, scale: 1, rotate: -3, duration: 0.35, ease: "back.out(2)" })
        .to({}, { duration: 1.8 })
        // act 2: no price move, maker tries to dodge a fair order
        .call(() => { setAct(2); reset(); price.v = 100.0; setPrice(); })
        .to(price, { v: 100.04, duration: 0.8, ease: "sine.inOut", onUpdate: setPrice })
        .fromTo("[data-fair]", { autoAlpha: 0, x: -60 }, { autoAlpha: 1, x: 0, duration: 0.6 })
        .fromTo("[data-dodge]", { autoAlpha: 0, x: -60 }, { autoAlpha: 1, x: 0, duration: 0.6 }, "-=0.2")
        .to("[data-sweep]", { scaleX: 1, duration: 0.9, ease: "none" })
        .to("[data-fair]", { x: 150, duration: 0.6, ease: "power2.in" }, "-=0.5")
        .to("[data-quote]", { backgroundColor: "#101828", duration: 0.3 })
        .fromTo("[data-stamp2]", { autoAlpha: 0, scale: 1.25, rotate: 6 }, { autoAlpha: 1, scale: 1, rotate: 2, duration: 0.35, ease: "back.out(2)" })
        .to("[data-dodge]", { autoAlpha: 0.35, duration: 0.2 }, "<")
        .to({}, { duration: 1.8 });
    },
    { scope: root }
  );

  return (
    <div ref={root} className="tile p-4 sm:p-5" aria-label="Animated illustration of the RECALL rule">
      <div className="flex items-center justify-between pb-3">
        <span className="pill"><span className="dot" />Simulation<span className="hidden sm:inline"> · rule walkthrough</span></span>
        <span className="mono text-[11px] text-iron">ACT {act} / 2</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="panel p-4">
          <div className="lbl">Signed reference price</div>
          <div className="mt-2 flex items-baseline gap-2">
            <span data-price className="mono text-[28px] font-light tracking-tight">100.00</span>
            <span data-move className="mono text-[12px]">+0 bps</span>
          </div>
          <div className="mt-1 text-[11px] text-[#9a9a9a]">stale at ≥ 25 bps</div>
        </div>
        <div className="panel p-4">
          <div className="lbl">Maker quote</div>
          <div className="mt-2 flex items-center gap-2">
            <span data-quote className="mono rounded-[6px] px-2 py-1 text-[14px] text-white" style={{ background: "#e42b0c" }}>ASK 100.00</span>
            <span className="mono text-[12px] text-[#9a9a9a]">× 20</span>
          </div>
          <div className="mt-2 text-[11px] text-[#9a9a9a]">{act === 1 ? "posted when price = 100.00" : "still fair: price barely moved"}</div>
        </div>
      </div>

      {/* block lanes */}
      <div className="relative mt-3 overflow-hidden rounded-[8px] border border-frost bg-vellum">
        <div className="grid grid-cols-3">
          {LANES.map((l, i) => (
            <div key={l} className={`h-[132px] p-2 ${i < 2 ? "border-r border-frost" : ""}`}>
              <div className="mono text-[10px] tracking-[.08em] text-iron">{l}</div>
            </div>
          ))}
        </div>
        <div data-sweep className="pointer-events-none absolute left-0 top-0 h-[2px] w-full origin-left" style={{ background: "var(--signal)" }} />

        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 400 132" preserveAspectRatio="none" aria-hidden="true">
          <path data-wire d="M120 96 C 170 96, 170 34, 230 34 L 400 34" stroke="#e42b0c" strokeWidth="1.5" fill="none" pathLength="1" strokeDasharray="1" strokeDashoffset="1" />
        </svg>

        {/* act 1 */}
        <div data-take className="packet left-2 top-7 invisible bg-carbon text-white">
          <span className="text-[#ff7a5c]">●</span> Sniper take · fee 50×
        </div>
        <div data-cancel className="packet left-2 top-[78px] invisible bg-white text-slate-900" style={{ border: "1px solid #e42b0c" }}>
          <span className="text-vermillion">●</span> Cancel · price +62 bps
        </div>
        <div data-stamp className="stamp absolute right-3 top-[64px] invisible">Take refused · quote gone</div>

        {/* act 2 */}
        <div data-fair className="packet left-2 top-7 invisible bg-white text-slate-900" style={{ border: "1px solid #d4d4d4" }}>
          <span className="text-slate-600">●</span> Fair buyer · normal fee
        </div>
        <div data-dodge className="packet left-2 top-[78px] invisible bg-carbon text-white">
          <span className="text-[#9a9a9a]">●</span> Cancel · price +4 bps
        </div>
        <div data-stamp2 className="stamp absolute right-3 top-[64px] invisible">No stale proof · trade fills</div>
      </div>

      {/* depth ladder in the vermillion frame */}
      <div className="mt-3 grid grid-cols-[1fr_auto] gap-3">
        <div className="frame-grid grid-cols-5">
          {LADDER.map(([p, c, s]) => (
            <div key={p} className={`cell ${c} min-h-12 flex-col`}>
              <span>{p}</span>
              <span className="text-[10px] opacity-70">{s}</span>
            </div>
          ))}
        </div>
        <div className="panel flex w-[118px] flex-col justify-center p-3">
          <div className="lbl">Trade waits</div>
          <div className="mono mt-1 text-[22px] font-light">1 block</div>
          <div className="text-[11px] text-[#9a9a9a]">≈ 0.4 s on Monad</div>
        </div>
      </div>
    </div>
  );
}
