<div align="center">

# RECALL

### An order book on Monad where pulling a stale quote beats the sniper, and only a stale quote.

![status](https://img.shields.io/badge/status-live%20on%20testnet-e42b0c) ![ci](https://github.com/subheeksh5599/recall/actions/workflows/test.yml/badge.svg) ![tests](https://img.shields.io/badge/forge%20tests-30%20passing-0f7a3d) ![verified](https://img.shields.io/badge/source-verified%20exact%20match-0f7a3d) ![network](https://img.shields.io/badge/network-Monad%20testnet-836EF9) ![stack](https://img.shields.io/badge/stack-Solidity%20%C2%B7%20Foundry%20%C2%B7%20Next.js%20%C2%B7%20viem-14151a) ![license](https://img.shields.io/badge/license-MIT-yellow)

**[Live site](https://different-skunk-560.convex.site) · [Console (try it)](https://different-skunk-560.convex.site/app) · [Contracts on explorer](https://testnet.monadexplorer.com/address/0x4Fa264Efc5DDa93c51f98cB9d5A25E81b4801916)**

[At a glance](#at-a-glance) · [The problem](#the-problem-were-solving) · [Run it](#run-it) · [Measured on mainnet](#measured-on-a-live-monad-book) · [Live races](#live-races-on-monad-testnet) · [The rule](#the-rule) · [Why Monad](#why-monad) · [Evidence](docs/EVIDENCE.md) · [Attack → test](#attack--test) · [Honesty table](#whats-real-vs-pending--the-honesty-table)

</div>

**Status: deployed on Monad testnet.** Both books, the signed-price verifier and the quote token
are live. The console (`web/`, Next.js) trades against them from any browser wallet, and the races
below were run on both books with real transactions. The rows that are still open say so.

A market maker posts prices. The market moves. The maker sends a cancel; a sniper sends a trade
against the old price. On an ordinary on-chain book the transaction with the bigger fee usually
lands first, so the sniper usually wins, and the maker's answer is to quote wider for everyone.
RECALL changes one rule: trades wait two blocks, cancels do not, and a cancel only gets ahead of a
waiting trade when a signed price proves the quote really went stale.

```
SNIPED  ≠  CANCELLED  ≠  DODGED
```

A cancel that protects a stale quote wins. A cancel that tries to dodge a fair customer loses.
The contract tells them apart from a signed price, not from anyone's say-so.

## At a glance

> **Track:** Onchain Finance & Trading · **Team:** Subheeksh (solo developer) · **Built:** within the Sep 1 – Oct 13, 2026 window · **License:** MIT

| | |
|---|---|
| **Problem** | On an on-chain order book, a market maker's quote goes stale the moment the price moves. A sniper pays a higher fee, lands first and trades against the old price. Makers pay for it by quoting thin and wide, and every trader pays the spread. |
| **Evidence it is real on Monad** | We measured a live MON/USDC order book on Monad mainnet for 24 hours: **5,188 fills, 14.9% of them hit a quote the outside market had already moved ≥10 bps through**, and makers re-posted **~123 orders per fill** to defend. Script and raw data in the repo. |
| **Solution** | RECALL, an order book contract with one rule: **trades wait 2 blocks (<1 s on Monad), cancels don't, and a cancel may overtake a waiting trade only if it carries a signed price proving the quote moved ≥ the stale threshold.** Snipers lose; makers still cannot dodge fair trades. |
| **What's new** | Cancel priority exists on some fast venues, but as a blanket rule that hands makers a free option to dodge fair orders. RECALL gates the cancel on a signed price verified inside the contract (3 of 5 independent signers, median, max age 60 s), and does it as a plain contract: no chain change, no off-chain sequencer. |
| **Why Monad** | ~0.4 s blocks make a 2-block wait nearly free; fee priority is the default ordering, which is exactly the race this removes; gas is charged on the limit, so settlement work is capped per call. |
| **Proof it works** | Same contract deployed twice (rule on / rule off) and raced with real transactions. Sniper at **50× priority fee lands first in the block on both books**: on the ordinary book it fills the stale quote; on RECALL it **finds nothing and is refunded** (e.g. block #70742447: take index 1, cancel index 3). A maker trying to dodge a fair take is deferred and the take fills. |
| **Quality** | 30 Foundry tests (one per guarantee/attack, fuzz, 2 invariants), all 4 contracts source-verified (exact match), CI on every push, receipts for every recorded race re-checkable with one command. |
| **Live product** | Next.js console on Convex: connect any wallet, wrap MON, claim test dollars, post/take/cancel with live signed prices, settle the queue, run the sniper race on either book, live event feed, contract registry. |
| **Stack** | Solidity 0.8.28 · Foundry · Next.js 16 (static export, React only) · viem · Convex static hosting · Alchemy RPC (Monad testnet) with public fallback · signed MON/USD price packages verified on-chain |
| **Status** | Live on Monad testnet. Open items are listed in the [honesty table](#whats-real-vs-pending--the-honesty-table). |

### Repository map

| Path | What it is |
|---|---|
| `contracts/src/RecallBook.sol` | the order book: post, take (queued), cancel (price-gated), settle; `cancelFirst` flag turns the rule off for the comparison book |
| `contracts/src/SignedPrice.sol` | on-chain verifier for signed price packages: fixed signer set, threshold, median, freshness, malleability and replay checks |
| `contracts/src/TestUSD.sol` | ownerless testnet quote token, 1,000 per address per hour |
| `contracts/test/` | `Rule.t.sol` (every guarantee and attack), `SignedPriceReal.t.sol` (real production signatures), invariants |
| `web/` | Next.js app: landing page and the sidebar console (`web/components/console/*`), shared chain code in `web/lib/` |
| `app/scripts/` | CLI race, live-book measurement, gas report, evidence verifier, browser end-to-end tests |
| `app/evidence/` | JSON receipts for every recorded race, the 24 h mainnet measurement, gas report |
| `hosting/` | Convex static hosting config and routes |
| `docs/EVIDENCE.md` | sources: research, trader reports, venues with cancel priority, Monad docs |

### How it works (one picture)

```
 block N        maker posts quote (+ signed price P0)          ── applies now
 block N+k      price moves; sniper sends take @ 50× fee        ── QUEUED, cannot fill before N+k+2
 block N+k      maker sends cancel + signed price P1            ── |P1−P0| ≥ stale bps?  yes → quote removed now
 block N+k+2    any call settles the queue, oldest first        ── take finds nothing → refunded
                                                                   no proof → cancel deferred, take fills
```

## The problem we're solving

**In one sentence:** on an on-chain order book, the market maker who provides the prices loses money every
time the price moves, because a sniper paying a higher fee can trade against the old quote before the
maker's cancel lands, and makers pass that loss on to every trader as wider spreads and thinner books.

**Step by step:**

1. A market maker posts "I sell MON at $0.02430".
2. The real market moves to $0.02445. The quote is now stale: it sells below the market price.
3. The maker sends a cancel. At the same instant a sniper sends a buy against the old quote.
4. The chain orders transactions by fee. The sniper pays 50× more and lands first.
5. The sniper buys cheap and the maker loses. Repeat on every price move.
6. To survive, makers quote **wider** (worse prices for everyone), **smaller** (less depth) and **re-post
   constantly** (we measured ~123 orders per fill on Monad). Ordinary traders pay this cost in every trade.

**Why the obvious fix fails:** letting every cancel jump every trade protects makers, but it also lets a
maker who sees a fair order coming pull the quote and dodge it. That free option is why US regulators
rejected an exchange speed bump in 2020. RECALL keeps the protection and removes the dodge: a cancel only
overtakes a waiting trade when a **signed price proves the quote really went stale**.

### Evidence the problem is real

**Measured on Monad mainnet (our own data, reproducible):**
24 hours on a live MON/USDC order book, 5,188 fills, $457K traded. **14.9% of fills (774) hit a quote the
outside market had already moved ≥10 bps through.** Makers posted ~123 orders per fill to defend themselves.
Script: `app/scripts/measure-live-book.mjs`. Raw data, one row per fill with tx hash: `app/evidence/live-book-fills.json`.
Details: [Measured on a live Monad book](#measured-on-a-live-monad-book).

**Research:**

| Finding | Source |
|---|---|
| Sniping stale quotes is about **20% of trading volume** and **17–33% of the cost of liquidity** in the markets studied | Budish, Cramton, Kyle, Lee, Malec, *Flow Trading*: http://www.cramton.umd.edu/papers2020-2024/budish-cramton-kyle-lee-malec-flow-trading-slides.pdf |
| Continuous order books create a speed race that taxes liquidity providers | Budish, Cramton, Shim, *The High-Frequency Trading Arms Race* (QJE): http://conference.nber.org/confer/2013/MDf13/Budish_Cramton_Shim.pdf |
| On-chain market makers cancel far more than they fill; slow confirmation lets the market move before a cancel lands | https://alearesearch.substack.com/p/risextrade |

**What traders say (Reddit):**

| Post | What they say | Link |
|---|---|---|
| r/CryptoCurrency, 6 Sep 2026: "Why continuous order books force market makers to widen your spreads (and why faster internet won't fix it)" | "the largest tax active traders pay on continuous order books is latency arbitrage … older quotes sit stale … HFTs … win the race to hit those stale quotes before the market maker can update them" | https://reddit.com/r/CryptoCurrency/comments/1w8sjq6/ |
| r/Kalshi, 11 Jul 2026: "Liquidity pulls" | "Market makers pull during play due to uncertainty - their posted orders are handled by high frequency systems meant to prevent them getting sniped" | https://reddit.com/r/Kalshi/comments/1utyslo/liquidity_pulls/owzlpfy/ |
| r/CryptoTechnology, 22 Feb 2026: "Adverse Selection in DeFi: Why AMMs Treat Every Trader Like They're Front-Running You" | "AMMs can't distinguish between informed flow … and uninformed flow … So they price in adverse selection for every trade" | https://reddit.com/r/CryptoTechnology/comments/1r841bc/adverse_selection_in_defi_why_amms_treat_every/o6rhuvz/ |
| r/solana, 29 May 2026: "Solana Spreads: The Black Hole Begins" | maker competition and spreads on an on-chain order book | https://reddit.com/r/solana/comments/1tqzr46/solana_spreads_the_black_hole_begins_by_sam/ |

**Fast venues already treat this as a real problem.** Several venues built in 2026 now give cancels priority
over trades, enforced in their own chain or sequencer. Monad orders by fee and its order books match trades
immediately, so nothing on Monad protects a maker yet. Every source, including venue docs and the 2020 regulatory
decision: [docs/EVIDENCE.md](docs/EVIDENCE.md).

## Live status

| Surface | Status | The evidence |
|---|---|---|
| Book contract (`contracts/src/RecallBook.sol`) | deployed twice: rule on, rule off | [Deployments](#deployments) |
| Price-gated cancel | live, verifying real signed MON/USD packages | `SignedPriceReal.t.sol` + every race below |
| Attack suite | 30 Foundry tests incl. fuzz + 2 invariants, all passing | `forge test` in `contracts/` |
| Monad testnet deployment | 4 contracts, chain 10143 | [Deployments](#deployments) |
| Maker and sniper | `app/scripts/race.mjs` and the console's Race Lab | [Live races](#live-races-on-monad-testnet) |
| Console (sidebar dashboard) | trades, cancels, settles, races; reads only the chain | [Run it](#run-it) |
| Measured stale-fill loss on a live Monad book | measured: 24 h, 5,188 fills, every fill priced against a 1-second outside reference | [Measured on a live Monad book](#measured-on-a-live-monad-book) |
| Source verification | all 4 deployed contracts, exact match (creation + runtime) | [Deployments](#deployments) |
| CI | `forge build` + `forge test`, and the web build, on every push | `.github/workflows/test.yml` |
| RPC | Alchemy (Monad testnet) for reads and transactions, public endpoint as fallback and for log scans | [Run it](#run-it) |

## The 20-second pitch

Snipers take money from market makers every time the price moves faster than a cancel can land.
Makers pass that cost on as a wider spread, so every ordinary trader pays it. The fix fast trading
venues use is to let cancels land before trades. On a 12-second chain that delay is unusable. On
Monad a block is about 0.4 seconds, so a trade waiting two blocks barely notices, and the rule can
live in a plain contract with nothing changed in the chain. RECALL adds one thing the old rule
lacks: a cancel only jumps the queue when a signed price shows the quote went stale, so a maker
cannot use it to back out of a fair trade.

## Measured on a live Monad book

Before building the fix, the cost had to be real on Monad, not only in papers. `app/scripts/measure-live-book.mjs`
pulls every fill from a live MON/USDC order book on Monad mainnet (`0x065C9d28E428A0db40191a54d33d5b7c71a9C394`)
and prices each one against a deep outside market's public 1-second MON/USDT price, with the median
stablecoin basis (−10.05 bps) removed. Raw output: `app/evidence/live-book-measurement.json` and
`live-book-fills.json` (one row per fill, with tx hash).

24 hours, blocks 112,552,814 → 112,768,814:

| | |
|---|---|
| Fills | 5,188, $457,208 traded |
| Filled when the outside price was already ≥ 10 bps through the quote | **774 fills, 14.9%**, $31,570 notional, makers gave up $45.53 |
| … ≥ 25 bps through | 9 fills, $2.02 |
| Makers' net result at +1 s / +30 s | +2.51 bps / +1.24 bps of volume |
| Loss on the losing fills at +30 s | $197.05 |
| Quote churn (sample of 3,000 blocks) | 8,513 orders posted and 4,683 cancel transactions for 69 fills, about **123 orders per fill** |

What this says, plainly:

- One fill in seven lands on a quote the market has already moved through. That is the stale-quote
  pick-off RECALL is built to stop, happening on Monad today.
- The dollar loss on this book is small, because makers here quote small and survive it: they still
  end up ahead overall, and they pay for that with constant re-posting, roughly 123 orders for every fill.
  The cost shows up as churn and thin size more than as a large loss.
- The measurement is approximate: 1-second resolution, an off-chain reference, and a 10 bps line that
  sits close to the noise. It is a lower bound on picking-off at sub-second scale, not a precise figure.

## Deployments

Monad testnet, chain id 10143. Deployed from `0x5686C606bB9ea46d46ED76F2Aaf3686913BAd4A3`.

| Contract | Address | Config |
|---|---|---|
| `RecallBook` (rule on) | `0x4Fa264Efc5DDa93c51f98cB9d5A25E81b4801916` | `cancelFirst = true`, delay 2 blocks, stale at 5 bps |
| `RecallBook` (rule off) | `0xbAf5dAE1f616F41cc0Acad3794359205bd00FCCd` | `cancelFirst = false`, same code |
| `SignedPrice` | `0xfD07A97627dB012D09AE6515dF7a46F008483Afa` | MON/USD, 3 of 5 signers, packages valid 60 s |
| `TestUSD` (quote) | `0x7Ad795D2ae9E554E50f8f5342C0787E5146322C3` | no owner, 1,000 per address per hour |
| WMON (base) | `0xFb8bf4c1CC7a94c73D209a149eA2AbEa852BC541` | the chain's own wrapped MON |

Deploy transactions: `contracts/broadcast/Deploy.s.sol/10143/run-latest.json`. All four contracts are
source-verified with an exact match on both creation and runtime bytecode
([check](https://sourcify.dev/server/v2/contract/10143/0x4Fa264Efc5DDa93c51f98cB9d5A25E81b4801916)).

**Gas charged per action** (Monad charges the limit; medians from the race receipts,
`node app/scripts/gas-report.mjs`):

| Action | RECALL | Ordinary |
|---|---|---|
| Post a quote | 324,742 | 368,197 |
| Take | 258,229 (queues) | 346,841 (fills) |
| Cancel | 313,321 (stale, overtakes) · 287,289 (deferred) | 312,802 |
| Settle the queue | 150,512 | — |

A RECALL take is cheaper at submission because it only queues; the fill is paid for by whichever
call settles it.

The signed prices are real: five independent signers publish MON/USD packages to a public gateway
every 10 seconds, and `SignedPrice` checks each signature, rejects unknown, repeated, malleable,
mixed-time, future and expired packages, and takes the median of three. The 5 bps threshold is set
from the feed's own movement: over two minutes of samples, 10-second steps were 0–4 bps and a 5 bps
move from a posted price arrived within about a minute.

## Live races on Monad testnet

The maker quotes both sides at the signed price. When the real price moves past 5 bps, the sniper
sends a take at 50× the priority fee (100 gwei against 2 gwei) and the maker sends an ordinary cancel
carrying the new signed price, at the same instant.

| Book | Move | Sniper take (block · index) | Maker cancel (block · index) | Outcome |
|---|---|---|---|---|
| Rule off | 5.14 bps | `0xb52dfa8f…3f193fb` · #70355992 · 1 | `0xd1f00ff2…f3bef74` · #70355992 · 7 | **Take filled the stale quote.** Cancel arrived to a filled order (`CancelTooLate`). |
| RECALL | 5.88 bps | `0x85fbe8d4…e05bac6b` · #70355690 · 1 | `0xb682541f…478f9984` · #70355690 · 3 | **Take found nothing.** Cancel removed the quote (`Cancelled`, stale) and the take was refunded at settlement (`0xf19df498…5d89c84b29`). |

The same three scenarios were then run again from the console's Race Lab in a headless browser
(`app/scripts/e2e-race.mjs`, the wallet bridged to a local key):

| Book | Scenario | Take (block · index) | Cancel (block · index) | What the chain recorded |
|---|---|---|---|---|
| RECALL | snipe, 11.11 bps | #70367163 · 1 | #70367163 · 3 | `TakeQueued`, `Cancelled` (stale), `FoundNothing` at #70367175 |
| Rule off | snipe, 5.01 bps | #70367895 · 1 | #70367895 · 5 | `TakeQueued`, `Filled`, `CancelTooLate` |
| RECALL | dodge, 0 bps | #70368409 · 1 | #70368409 · 3 | `TakeQueued`, `CancelDeferred`, `Filled` at #70368423 |

Run again after the move to Next.js, from the hosted console:

| Book | Scenario | Take (block · index) | Cancel (block · index) | What the chain recorded |
|---|---|---|---|---|
| RECALL | dodge, 0.03 bps | #70734414 · 1 | #70734414 · 3 | `TakeQueued`, `CancelDeferred`, then the fair take filled at settlement |
| RECALL | snipe, 11.11 bps | #70734708 · 1 | #70734708 · 4 | `TakeQueued`, `Cancelled` (stale), `FoundNothing` at settlement |

`node app/scripts/verify-evidence.mjs` re-reads every recorded run from chain receipts and prints
the events above.

Read the indices: on both books the sniper's higher fee put its take **ahead** of the cancel in the
same block, exactly as fee ordering intends. On the ordinary book that was the end of it. On RECALL
the take only queued, so the cancel, landing second, still won. Full receipts are in
`app/evidence/*.json` and the console's Overview page lists every recorded run with explorer links.

## Beyond the demo video

The video shows setup and one live race starting. The console does more, and each of these was run against
the deployed contracts from the hosted console, with receipts:

| Not in the video | Where | Recorded result |
|---|---|---|
| Race result on the RECALL book | Race Lab → RECALL → Snipe | take #70742447 · index 1 queued, cancel same block · index 3 removed the quote, take found nothing (`app/evidence/race-recall-snipe-1791913005244.json`) |
| The same race on the ordinary book | Race Lab → Ordinary → Snipe | take #70742879 · index 1 filled the stale quote, cancel arrived to a filled order (`race-plain-snipe-1791913132228.json`) |
| A maker trying to dodge a fair trade | Race Lab → Maker dodges a fair take | cancel deferred, the fair take filled at settlement (`race-recall-dodge-1791910554465.json`) |
| Trading from your own wallet | Trade | post a quote with the live signed price (the token approval is requested automatically), buy or sell into a quote, cancel, settle the queue |
| Wrap / unwrap MON, claim test dollars | Trade → Account | one click each |
| Live event feed and every queued take | Activity | read from chain logs and contract state |
| Addresses, parameters, signer set | Contracts | read from the chain; source verified |
| Moving race wallets between browsers | Race Lab → Back up keys / Restore keys | |
| Returning race funds | Race Lab → Sweep back | |

`node app/scripts/verify-evidence.mjs` re-reads every recorded race from chain receipts.

## Run it

**Hosted.** https://different-skunk-560.convex.site (landing) and `/app` (console). The whole front end is
one Next.js app in `web/` (React components only, no hand-written HTML), statically exported and served by
Convex static hosting from `hosting/`:

```bash
cd hosting && npm i && npm run deploy   # builds web/, deploys the HTTP routes, uploads out/
```

**RPC.** The console reads and sends through an RPC provider (Alchemy, Monad testnet) set by
`NEXT_PUBLIC_MONAD_RPC` in `web/.env.local`, with the public Monad endpoint as automatic fallback. Log scans
use the public endpoint, which serves 100-block ranges. Scripts take `MONAD_RPC` the same way.

**Console locally.**

```bash
cd web && npm i && npm run dev            # http://localhost:4320/app
```

| Path | What it is |
|---|---|
| `web/app/(site)/page.jsx` | landing page, built from `web/components/landing/*` |
| `web/app/(console)/app/page.jsx` | the sidebar console |
| `web/components/console/store.js` | chain reads, wallet, race wallets: one store, polled |
| `web/lib/chain.js`, `web/lib/race.js` | addresses, ABIs, signed-price fetch and verify, the race; shared with `app/scripts` |

| Page | What you can do |
|---|---|
| Overview | both books' counters (fills, takes that found nothing, stale cancels, deferred dodges), recorded races |
| Trade | connect any EVM wallet (Monad testnet is added for you), wrap MON, claim tUSD, approve, post a quote with the live signed price attached, buy or sell into a quote, cancel (a fresh signed price is attached when a take is waiting), settle the queue |
| Race Lab | fund two race wallets from your wallet, prepare them, run snipe or dodge on either book, watch the move meter and the block/index of each transaction, sweep the funds back |
| Activity | a live tail of book events and every take each book has queued |
| Contracts | addresses, parameters and the signer set, read from the chain |

**Measure a live Monad book.** `cd app && node scripts/measure-live-book.mjs 24` (public endpoints only, ~10 min).

**Contracts.**

```bash
cd contracts && forge test                     # 30 tests
WMON=0xFb8b... STALE_BPS=5 ./script/with-account.sh bash -c \
  'forge script script/Deploy.s.sol --rpc-url https://testnet-rpc.monad.xyz \
   --private-key "$PRIVATE_KEY" --sender "$DEPLOYER" --broadcast --slow'
```

**Browser end-to-end.** With `PLAYWRIGHT_DIR=<node_modules with playwright>` and `APP_URL=<console url>`:
`node app/scripts/e2e-trade.mjs` connects a wallet, posts a quote with the live signed price and cancels it;
`node app/scripts/e2e-race.mjs recall snipe` runs the Race Lab and saves a screenshot next to the receipts.

**Race from the terminal.** `cd app && npm i && node scripts/race.mjs recall snipe` (or `plain`,
`dodge`). Keys are read from `~/.config/recall/`, never from the repo.

## Table of contents

- [At a glance](#at-a-glance)
- [The problem we're solving](#the-problem-were-solving)

- [Measured on a live Monad book](#measured-on-a-live-monad-book)
- [Deployments](#deployments)
- [Live races on Monad testnet](#live-races-on-monad-testnet)
- [Beyond the demo video](#beyond-the-demo-video)
- [Run it](#run-it)
- [The rule](#the-rule)
- [The problem I set out to solve](#the-problem-i-set-out-to-solve)
- [What RECALL is NOT](#what-recall-is-not)
- [Why Monad](#why-monad)
- [The settlement loop, step by step](#the-settlement-loop-step-by-step)
- [What "stale" means](#what-stale-means)
- [Where the guarantee is enforced](#where-the-guarantee-is-enforced)
- [Attack → test](#attack--test)
- [What the demo shows](#what-the-demo-shows)
- [What's real vs pending — the honesty table](#whats-real-vs-pending--the-honesty-table)
- [Limitations](#limitations)
- [Build plan](#build-plan)
- [License](#license)

## The rule

1. **Quotes and cancels apply the moment they land.** Posting, amending and cancelling a resting
   order needs no wait.
2. **Trades that take liquidity wait.** A take submitted in block `N` is queued, not matched.
3. **Waiting trades settle first.** Every call into the book first settles all queued takes from
   blocks `≤ N − D` (`D` = the delay; 2 in the deployed book), oldest first, then does its own work.
4. **A same-window cancel beats a waiting trade only if the quote went stale.** The cancel carries
   a signed price. If that price has moved more than the market's staleness threshold since the
   quote was posted, the cancel removes the quote before the waiting trade can fill against it.
   If it has not, the waiting trade fills as if the cancel came after it.

Plain words: snipers lose, fair customers still get filled.

## The problem I set out to solve

- **Stale quotes are a cost every trader pays.** A maker who loses to snipers every time the price
  jumps has to quote wider to stay alive, so the spread carries the sniping.
- **Fee priority makes it a fee race.** When ordering follows the fee paid, a sniper who pays
  fifty times the fee usually lands ahead of a maker's ordinary cancel.
- **The usual fix hands the maker a free option.** Letting every cancel jump every trade protects
  the maker against snipers, but also lets a maker who sees a fair order coming pull the quote and
  dodge it. RECALL keeps the protection and removes the dodge.

Sources for every claim in this section, including trader posts, research and the venues that
already enforce cancel priority: [docs/EVIDENCE.md](docs/EVIDENCE.md).

## What RECALL is NOT

- **Not a new chain rule.** Nothing in consensus or block building changes. It is a contract.
- **Not a new idea in exchange design.** Delaying trades while letting cancels through is decades
  old. What is new here is doing it as an ordinary contract on a sub-second chain, and gating the
  cancel on a signed price so it cannot be used to dodge fair flow.
- **Not a promise against a colluding block producer.** See [Limitations](#limitations).
- **Not a price oracle.** It consumes signed prices; it does not produce them.

## Why Monad

- **The delay is cheap.** A block is roughly 0.4 seconds, so the deployed 2-block wait is under a second.
  The same rule on a 12-second chain would make every trade wait 24 seconds.
- **Fee priority is the default ordering.** Higher fees usually go first, which is exactly the race
  this rule takes away.
- **Fees are charged on the gas limit, not the gas used.** Settlement work is capped per call so a
  trader's fee stays predictable rather than paying for a worst-case queue.
- **Fast signed prices exist on the chain.** The staleness check is one signed-price read per call.

## The settlement loop, step by step

1. A call arrives (take, post, cancel or an explicit `settle`).
2. The contract settles queued takes from blocks `≤ current − D`, oldest first, up to the
   per-call work cap.
3. If takes from blocks `≤ current − D` are still queued after the cap, new takes are refused
   until the backlog clears. Cancels and posts still run.
4. The call does its own work: queue a take, apply a post, or apply a cancel.
5. A cancel that arrives while a take against the same quote is waiting is checked against the
   signed price (see below). Stale: the quote is removed and the waiting take finds nothing.
   Not stale: the cancel is applied only after that take has settled.

Each block's queue has a hard size cap, so nobody can stuff the queue to delay everyone else.

## What "stale" means

| Field | Meaning |
|---|---|
| `postPrice` | the signed reference price recorded when the quote was posted |
| `cancelPrice` | the signed reference price carried by the cancel |
| `staleBps` | per-market threshold; stale when `|cancelPrice − postPrice| / postPrice ≥ staleBps` |
| `maxAge` | a signed price older than this is rejected outright |

The check is arithmetic over two signed numbers and a threshold. No model, no keeper, no vote.

## Where the guarantee is enforced

| Guarantee | Where it lives | Test |
|---|---|---|
| A take never matches in its own block | `take()` queues; `_settle` waits `delay` blocks | `test_TakeNeverMatchesInItsOwnBlock` |
| Older takes always settle before newer calls act | `_settle` at the top of every call | `test_OlderTakesSettleBeforeANewCallActs`, `test_OldestTakeSettlesFirst` |
| A stale-proven cancel removes the quote before a waiting take | `cancel()` stale branch | `test_FeeRace_StaleCancelBeatsAWaitingTake` |
| A cancel without a stale proof cannot dodge a waiting take | `cancel()` deferred branch | `test_Dodge_CancelWithoutAMoveWaitsForTheTrade`, `test_Dodge_CancelWithNoPriceAtAllWaits` |
| Per-call work and per-block queue stay bounded | `WORK_CAP`, `MAX_PER_BLOCK`, backlog refusal | `test_QueueFlood_*`, `test_Backlog_*` |
| Funds in = funds out across every fill, cancel and refund | escrow per order and per take | `testFuzz_Conservation`, `invariant_BookHoldsExactlyWhatItOwes` |

## Attack → test

| The attack | What should happen | Test |
|---|---|---|
| Sniper pays 50× the fee to beat a stale-price cancel | cancel wins, take finds nothing | `test_FeeRace_StaleCancelBeatsAWaitingTake` + live race above |
| Maker sees a waiting fair trade and cancels to dodge it | take fills, cancel applies after | `test_Dodge_*` |
| Maker forges, tampers or replays a signed price | cancel rejected | `test_BadPrice_Forged…`, `…Tampered…`, `…ReplayOfThePostPrice…`, `…OneSignerTwice…`, `…Malleable…`, `…MixedTimestamps…` |
| Maker uses an old or future-dated signed price | rejected past `maxAge` / beyond 60 s skew | `test_BadPrice_ExpiredPackageRejected`, `…FuturePackageRejected` |
| Someone floods the queue to stall settlement | queue cap refuses the excess | `test_QueueFlood_PerBlockCapRefusesTheExcess` |
| Settlement backlog grows past the per-call cap | new takes refused until cleared, cancels still work | `test_Backlog_RefusesNewTakesButCancelsAndPostsRun` |
| Block producer drops the cancel from one block | with `D = 2`, a cancel in the next block still lands first | `test_DroppedCancel_NextBlockCancelStillLandsFirst` |

## What the demo shows

Two books on Monad testnet, same contract, one with the rule switched off, driven from the console's
Race Lab or `app/scripts/race.mjs`.

- Ordinary book: the sniper fills the stale quote.
- RECALL: the cancel lands first and the sniper finds nothing.
- Dodge: the maker cancels against a fair take with no price move. RECALL defers the cancel and the
  take fills.

The Overview page counts fills, takes that found nothing, stale cancels and deferred dodges on both
books from contract state, so the comparison cannot look good just because trades were refused.

## What's real vs pending — the honesty table

| Claim | State |
|---|---|
| The rule as specified above | implemented, deployed, 30 tests passing |
| Snipers lose on RECALL | shown on chain (race table above) and in tests |
| Fair trades still fill | shown in tests (`test_Dodge_*`) and runnable live from the Race Lab |
| Makers can quote tighter | not yet measured: needs many rounds and a spread model |
| A dollar figure for stale-quote losses on a live Monad book today | measured over 24 h (above): 14.9% of fills stale by ≥ 10 bps, $45.53 given up, ~123 orders per fill |
| The rule beats a colluding block producer | not claimed |
| The quote token is real money | no: `TestUSD` is a capped testnet claim token |

## Limitations

- **A colluding block producer still sees trades early.** Transactions are forwarded to upcoming
  block producers. One that colludes with a maker can show it a waiting trade. The price gate means
  that peek is worthless without a real price move, but it does not remove the producer's view.
- **Trades wait.** Every take pays at least one block of delay, and two with `D = 2`.
- **The staleness threshold is a policy.** Set too low, makers cancel on noise; set too high, a
  real move goes unprotected.
- **Signed prices are trusted for what they say.** A wrong signed price makes a wrong staleness
  call. Three of the five fixed signers must agree on one timestamp.
- **The cancel has to arrive inside the delay window.** The book waits 2 blocks (under a second). In one
  console run on a slow machine the maker's cancel landed 2 blocks after the sniper's take, the window had
  closed, and the take filled (block #70740457 → #70740459). The race now signs both transactions before
  sending; a maker on a slow connection still needs a longer delay, which is a deploy-time setting.
- **A maker with no taker waiting cancels freely.** The gate only matters while a take is queued,
  which is the only moment a cancel can hurt anyone.
- **Race wallets live in browser storage.** The console says so and offers a key backup and a sweep.

## Build plan

1. ~~The book contract with the rule, behind a switch that turns it into an ordinary book.~~
2. ~~Foundry tests: one per attack row, plus fuzzing and a funds-in = funds-out invariant.~~
3. ~~Deploy to Monad testnet and run maker and sniper against both books.~~
4. ~~The sidebar console, reading only the chain.~~
5. ~~Measure stale fills on a live Monad book from its own trade history.~~
6. Run the race over many rounds and measure how much tighter a maker can quote on RECALL.

## License

[MIT](LICENSE)
