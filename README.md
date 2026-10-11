<div align="center">

# RECALL

### An order book on Monad where pulling a stale quote beats the sniper, and only a stale quote.

![status](https://img.shields.io/badge/status-design%20stage-orange) ![network](https://img.shields.io/badge/network-Monad%20testnet-836EF9) ![stack](https://img.shields.io/badge/stack-Solidity%20%C2%B7%20Foundry%20%C2%B7%20Next.js-14151a) ![license](https://img.shields.io/badge/license-MIT-yellow)

[The rule](#the-rule) · [Why Monad](#why-monad) · [Attack → test](#attack--test) · [Honesty table](#whats-real-vs-pending--the-honesty-table)

</div>

**Status: design stage.** Nothing is deployed and no contract code exists yet. This file is the
specification the build has to meet. Every row in the live status table below says what is still
missing, and it changes only when a transaction or a test exists to point at.

A market maker posts prices. The market moves. The maker sends a cancel; a sniper sends a trade
against the old price. On an ordinary on-chain book the transaction with the bigger fee usually
lands first, so the sniper usually wins, and the maker's answer is to quote wider for everyone.
RECALL changes one rule: trades wait one block, cancels do not, and a cancel only gets ahead of a
waiting trade when a signed price proves the quote really went stale.

```
SNIPED  ≠  CANCELLED  ≠  DODGED
```

A cancel that protects a stale quote wins. A cancel that tries to dodge a fair customer loses.
The contract tells them apart from a signed price, not from anyone's say-so.

## Live status

| Surface | Status | The evidence |
|---|---|---|
| Book contract | not written | nothing yet |
| Price-gated cancel | specified below | nothing yet |
| Attack suite | specified below | nothing yet |
| Monad testnet deployment | not deployed | nothing yet |
| Maker and sniper bots | not written | nothing yet |
| Side-by-side dashboard | not built | nothing yet |
| Measured stale-fill loss on a live Monad book | not measured | nothing yet |

## The 20-second pitch

Snipers take money from market makers every time the price moves faster than a cancel can land.
Makers pass that cost on as a wider spread, so every ordinary trader pays it. The fix fast trading
venues use is to let cancels land before trades. On a 12-second chain that delay is unusable. On
Monad a block is about 0.4 seconds, so a trade waiting one block barely notices, and the rule can
live in a plain contract with nothing changed in the chain. RECALL adds one thing the old rule
lacks: a cancel only jumps the queue when a signed price shows the quote went stale, so a maker
cannot use it to back out of a fair trade.

## Table of contents

- [The rule](#the-rule)
- [The problem I set out to solve](#the-problem-i-set-out-to-solve)
- [What RECALL is NOT](#what-recall-is-not)
- [Why Monad](#why-monad)
- [The settlement loop, step by step](#the-settlement-loop-step-by-step)
- [What "stale" means](#what-stale-means)
- [Where the guarantee is enforced](#where-the-guarantee-is-enforced)
- [Attack → test](#attack--test)
- [What the demo will show](#what-the-demo-will-show)
- [What's real vs pending — the honesty table](#whats-real-vs-pending--the-honesty-table)
- [Limitations](#limitations)
- [Build plan](#build-plan)
- [License](#license)

## The rule

1. **Quotes and cancels apply the moment they land.** Posting, amending and cancelling a resting
   order needs no wait.
2. **Trades that take liquidity wait.** A take submitted in block `N` is queued, not matched.
3. **Waiting trades settle first.** Every call into the book first settles all queued takes from
   blocks `≤ N − D` (`D` = the delay, 1 by default), oldest first, then does its own work.
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

## What RECALL is NOT

- **Not a new chain rule.** Nothing in consensus or block building changes. It is a contract.
- **Not a new idea in exchange design.** Delaying trades while letting cancels through is decades
  old. What is new here is doing it as an ordinary contract on a sub-second chain, and gating the
  cancel on a signed price so it cannot be used to dodge fair flow.
- **Not a promise against a colluding block producer.** See [Limitations](#limitations).
- **Not a price oracle.** It consumes signed prices; it does not produce them.

## Why Monad

- **The delay is cheap.** One block is roughly 0.4 seconds. The same rule on a 12-second chain
  would make every trade wait 12 seconds.
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

| Guarantee | Where it will live | The test that will cover it |
|---|---|---|
| A take never matches in its own block | the take path | planned |
| Older takes always settle before newer calls act | the settlement loop | planned |
| A stale-proven cancel removes the quote before a waiting take | the cancel path | planned |
| A cancel without a stale proof cannot dodge a waiting take | the cancel path | planned |
| Per-call work and per-block queue stay bounded | the settlement loop | planned |
| Funds in = funds out across every fill, cancel and refund | the book's accounting | planned invariant |

## Attack → test

| The attack | What should happen | Test |
|---|---|---|
| Sniper pays 50× the fee to beat a stale-price cancel | cancel wins, take finds nothing | planned |
| Maker sees a waiting fair trade and cancels to dodge it | take fills, cancel applies after | planned |
| Maker forges or replays a signed price | cancel rejected | planned |
| Maker uses an old signed price | rejected past `maxAge` | planned |
| Someone floods the queue to stall settlement | queue cap refuses the excess | planned |
| Settlement backlog grows past the per-call cap | new takes refused until cleared, cancels still work | planned |
| Block producer drops the cancel from one block | with `D = 2`, a cancel in the next block still lands first | planned |

## What the demo will show

Two books side by side on Monad testnet, same contract, one with the rule switched off. A maker
bot quotes around a live signed price; a sniper bot watches the same price. When the price jumps,
the sniper sends a take with fifty times the fee and the maker sends an ordinary cancel.

- Ordinary book: the sniper fills the stale quote.
- RECALL: the cancel lands first and the sniper finds nothing.
- Then a fair order arrives and the maker tries to cancel against it with no price move. RECALL
  fills it anyway.

Across a hundred rounds the dashboard will report fills, refused takes, cancels, volume, the spread
after each fill and maker profit, on both books, so the comparison cannot look good just because
trades were refused.

## What's real vs pending — the honesty table

| Claim | State |
|---|---|
| The rule as specified above | written here, not implemented |
| Snipers lose on RECALL | not yet shown |
| Fair trades still fill | not yet shown |
| Makers can quote tighter | not yet measured |
| A dollar figure for stale-quote losses on a live Monad book today | not yet measured |
| The rule beats a colluding block producer | not claimed |

## Limitations

- **A colluding block producer still sees trades early.** Transactions are forwarded to upcoming
  block producers. One that colludes with a maker can show it a waiting trade. The price gate means
  that peek is worthless without a real price move, but it does not remove the producer's view.
- **Trades wait.** Every take pays at least one block of delay, and two with `D = 2`.
- **The staleness threshold is a policy.** Set too low, makers cancel on noise; set too high, a
  real move goes unprotected.
- **Signed prices are trusted for what they say.** A wrong signed price makes a wrong staleness
  call.

## Build plan

1. The book contract with the rule above, behind a switch that turns it into an ordinary book.
2. Foundry tests: one per attack row, plus fuzzing and a funds-in = funds-out invariant.
3. Deploy to Monad testnet and run the maker and sniper bots against both books.
4. The side-by-side dashboard, reading only the chain.
5. Measure stale fills on a live Monad book from its own trade history.

## License

[MIT](LICENSE)
