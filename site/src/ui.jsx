export const LINKS = {
  repo: "https://github.com/subheeksh5599/recall",
  spec: "https://github.com/subheeksh5599/recall#the-rule",
  loop: "https://github.com/subheeksh5599/recall#the-settlement-loop-step-by-step",
  attacks: "https://github.com/subheeksh5599/recall#attack--test",
  evidence: "https://github.com/subheeksh5599/recall/blob/main/docs/EVIDENCE.md",
  license: "https://github.com/subheeksh5599/recall/blob/main/LICENSE",
  research: "http://www.cramton.umd.edu/papers2020-2024/budish-cramton-kyle-lee-malec-flow-trading-slides.pdf",
  gas: "https://docs.monad.xyz/developer-essentials/gas-pricing",
  book: "https://docs.kuru.io/contracts/OrderBook",
};

export function Arrow({ className = "" }) {
  return (
    <svg className={`arr ${className}`} width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M1 7h11M8 3l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Mark({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect width="24" height="24" rx="6" fill="#e42b0c" />
      <path d="M8 6.5h5.2a3.6 3.6 0 0 1 0 7.2H8V6.5Zm0 7.2 6.6 4" stroke="#fff" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Wordmark({ dark = false }) {
  return (
    <span className="inline-flex items-center gap-2">
      <Mark />
      <span className={`text-[20px] font-semibold tracking-[-0.02em] ${dark ? "text-white" : "text-black"}`}>RECALL</span>
    </span>
  );
}
