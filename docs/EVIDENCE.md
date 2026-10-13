# Evidence: is the problem real, is it solved, and where

Every link below was opened or returned by search while this file was written (11 Oct 2026).
Links marked *(bot-walled)* return 403 to scripts but open in a browser.

## 1. The problem is real and measured

| Claim | Source |
|---|---|
| Stale quotes get "sniped"; sniping is about 20% of trading volume and 17–33% of the cost of liquidity in the markets studied | Budish, Cramton, Kyle, Lee, Malec, *Flow Trading* slides: http://www.cramton.umd.edu/papers2020-2024/budish-cramton-kyle-lee-malec-flow-trading-slides.pdf |
| The original argument: continuous order books create a speed race that taxes liquidity | Budish, Cramton, Shim, *The High-Frequency Trading Arms Race* (QJE): http://conference.nber.org/confer/2013/MDf13/Budish_Cramton_Shim.pdf · CFTC presentation: https://www.cftc.gov/sites/default/files/idc/groups/public/@newsroom/documents/file/tac021014_budish.pdf |
| On-chain: market makers cancel far more than they fill, and slow blocks confirm cancels after the market has moved | https://alearesearch.substack.com/p/risextrade |

## 2. What traders say (Reddit)

| Post | Link |
|---|---|
| "Why continuous order books force market makers to widen your spreads (and why faster internet won't fix it)", r/CryptoCurrency, 6 Sep 2026: "the largest tax active traders pay on continuous order books is latency arbitrage … older quotes sit stale … HFTs … win the race to hit those stale quotes before the market maker can update them" | https://reddit.com/r/CryptoCurrency/comments/1w8sjq6/ *(bot-walled)* |
| "Market makers pull during play due to uncertainty - their posted orders are handled by high frequency systems meant to prevent them getting sniped", r/Kalshi, 11 Jul 2026 | https://reddit.com/r/Kalshi/comments/1utyslo/liquidity_pulls/owzlpfy/ |
| "AMMs can't distinguish between informed flow … and uninformed flow … So they price in adverse selection for every trade", r/CryptoTechnology, 22 Feb 2026 | https://reddit.com/r/CryptoTechnology/comments/1r841bc/adverse_selection_in_defi_why_amms_treat_every/o6rhuvz/ |
| "Solana Spreads: The Black Hole Begins" (maker competition and spreads on-chain), r/solana, 29 May 2026 | https://reddit.com/r/solana/comments/1tqzr46/solana_spreads_the_black_hole_begins_by_sam/ |
| Kuru described as "the first fully on-chain orderbook DEX" on Monad, r/Monad, 20 Mar 2026 | https://reddit.com/r/Monad/comments/1ryx7ri/are_there_are_monad_foundation_team_members_you/obj3bdn/ |

## 3. Other venues already fixed it with cancel/maker priority

| Venue | What it does | Source |
|---|---|---|
| Hyperliquid (own L1) | "Cancels and post-only orders are prioritized above GTC and IOC orders", enforced by the L1 | https://hyperliquid.medium.com/latency-and-transaction-ordering-on-hyperliquid-cf28df3648eb *(bot-walled)* |
| Decibel (Aptos) | "On-chain cancel prioritization lets market makers quote deeper liquidity with tighter spreads while reducing toxic flow risk. Already live" (Avery Ching, Aptos) | https://x.com/AveryChing/status/2031972886458822811 |
| Jito BAM (Solana) | Maker Priority Plugin, live on a Solana spot exchange | https://bam.dev/blog/an-update-on-bams-maker-priority-plugin-mpp |
| Ethereal | "block execution with post + cancel prioritization": taker orders held until end of block | https://docs.ethereal.trade/trading/perpetual-futures/block-execution |
| Meridian | "Orders that take liquidity enter a short holding block. Maker orders and resting-order cancellations bypass it." | https://docs.meridian.xyz/trading/perpetual-futures/block-execution |
| Research | Ethereum research post comparing ways to enforce cancel prioritization on general-purpose chains | https://ethresear.ch/t/application-controlled-execution-a-case-study-on-cancel-prioritization/23977 |

## 4. Traditional exchanges tried it, and it was contested

| Event | Source |
|---|---|
| TMX Alpha (Canada) introduced a speed bump in 2015 | https://osc.ca/sites/default/files/2020-12/alpha-exchange_20141106_amd-request-for-comments.pdf |
| The US SEC **rejected** Cboe EDGA's proposed delay in 2020, after objections that it protected market makers at traders' expense | https://thetradenews.com/sec-denies-cboe-stock-exchange-speed-bump-proposal · https://www.sec.gov/rules/sro/cboeedga/2020/34-88261.pdf *(bot-walled)* |

This is the objection RECALL's price gate answers: a cancel only beats a waiting trade when a
signed price proves the quote went stale, so a maker cannot use it to back out of a fair trade.

## 5. Monad does not have it yet

| Fact | Source |
|---|---|
| Monad orders transactions by fee by default (priority gas auction) | https://docs.monad.xyz/developer-essentials/gas-pricing |
| Monad charges the gas limit, not gas used | same page |
| Kuru (Monad's on-chain order book) uses plain "price-time priority matching"; orders match immediately against resting orders | https://docs.kuru.io/contracts/OrderBook |
| Perpl (Monad perps) tells market makers to amend in place rather than cancel and repost, to avoid gaps; no cancel priority | https://docs.perpl.xyz/resources/for-developers/best-practices |
| In the ~460 Monad repos created during the Metropolis build window, none mentions cancel priority, queued takers or a holding block | GitHub search, `monad created:>2026-08-31` and variants, run 11 Oct 2026 |

## What this does and does not prove

- **Proves:** sniping stale quotes is a measured cost; several fast venues fixed it in 2026; Monad's
  two order books have not.
- **Measured since:** how often Monad makers are hit today. 24 h on a live Monad mainnet MON/USDC book:
  14.9% of 5,188 fills hit a quote already ≥10 bps stale; ~123 orders posted per fill. See the README section
  "Measured on a live Monad book" and `app/evidence/live-book-measurement.json`.
