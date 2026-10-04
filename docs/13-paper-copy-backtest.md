# Historical paper-copy experiment

Updated: 5 October 2026. Implementation: `scripts/paper_copy.py` and `scripts/paper_copy_data.py`.

## Purpose

Measure what a delayed, small copy of a publicly associated trader wallet might have earned.
The experiment collects actual blockchain evidence and models conditional execution. It does
not yet provide certified executable profit labels or a trading recommendation.

## Exact sources

| Source | Used for | Credentials | Important boundary |
|---|---|---|---|
| [Fomopulse public repository](https://github.com/itsnex1s/fomopulse-robinhood-chain-tape) | Public handle-to-wallet roster; read-only reconstruction design | None | MIT; a roster association is not verified ownership. The roster selected after the historical period creates selection/survival bias. |
| [Robinhood public RPC](https://docs.robinhood.com/chain/connecting/) | `eth_chainId`, `eth_blockNumber`, `eth_getBlockByNumber`, `eth_getLogs`, `eth_getTransactionReceipt`, `eth_getTransactionByHash`, metadata-only `eth_call` | None | Rate limited. Old contract-state calls are not assumed to work. Successful intervals are checkpointed; errors never become empty history. |
| `https://rpc.ordofi.network` | Public RPC fallback already configured in Fomopulse | None | Same chain-ID check and provenance; no uptime or archival completeness guarantee. |
| [Uniswap v4 event interface](https://github.com/Uniswap/v4-core/blob/main/src/interfaces/IPoolManager.sol) | Historical pool price, active liquidity, fees, liquidity changes, pool keys | None | Supported manager is `0x8366a39cc670b4001a1121b8f6a443a643e40951`. Other venues remain unsupported. |

The hosted Fomopulse API is **not** used: it returned HTTP 401 requiring a key during the audit.
Fomo consumer/private APIs, X, paid services and wallet signing are not used.

The collector uses the Fomopulse roster and reconstruction approach rather than rebuilding a
discovery service. This Python archival adapter stores evidence specifically needed for replay;
the existing Fomopulse application remains the prospective monitoring candidate.

## Run and extend

Requires Python 3.10 or later; the new experiment uses the standard library only.

```sh
python3 scripts/paper_copy.py collect \
  --roster /absolute/path/to/fomopulse/config/wallets.json \
  --start 2026-09-05T00:00:00Z --end 2026-09-05T02:00:00Z \
  --output .research/paper-copy-2026-09-05
python3 scripts/paper_copy.py backtest --output .research/paper-copy-2026-09-05
python3 -m unittest discover -s tests -p test_paper_copy.py -v
```

The date window is a fixed pipeline experiment, not a claim of all historical activity. It is
chosen by time rather than token performance. The same commands support wider or additional
windows; use a new output directory for a new cohort. Repeating the same collection resumes
from stored requests and successful scan intervals. One hour before the window supplies
past-only wallet context; 960 seconds after it supplies outcome data and delay allowance.

Raw inputs, classifications, price paths and outputs are saved locally before any headline
result is reported. The collector rejects a different cohort/roster in the same output store.

## What is captured

`history.sqlite` keeps successful RPC responses and retrieval time/source, raw logs, full
transaction receipts and calldata, actual block timestamps/hash, metadata with fidelity,
historical pool keys, classified wallet legs and successful range checkpoints. It retains
failed scan records. Failed/incomplete collection cannot be passed to the backtester.

Times come from block headers or nonzero archive-log `blockTimestamp` fields, checked
against saved headers wherever they overlap. Conflicting times/hashes stop collection;
zero timestamp fields are never accepted. The supplementary timestamp reply is saved
in the RPC evidence cache. Bounded batches and interval checkpoints avoid restarting
the entire download when a public provider becomes unavailable.

Only single-wallet, single-token swap receipts with a USDG cash leg receive a dollar-cost
proxy. Its largest cash transfer is the same kind of reconstruction used in Fomopulse;
it is not a complete user-account cash-flow reconciliation. Other wallet transfers,
multi-leg attribution, unpriced routes and handouts remain in the denominator/export.
Latest token decimals/symbols are explicitly marked current metadata. No current price,
liquidity, balance, follower count or PnL is backdated into the experiment.

Pool keys are recovered either from historical initialization events or historical calldata
whose ABI-encoded hash equals an observed Swap pool ID. A candidate key is not accepted
merely because its token symbols look plausible. The original pool identifiers and
contract addresses are retained.

## Registered strategies and experiment grid

- Copy all eligible buys.
- Unusually large: buy size at least three times that wallet's earlier observed median,
  after at least five earlier buys. The current purchase is excluded from its own baseline.
- Multiple wallets: at least two **other** roster wallets bought the exact token in the
  preceding five minutes. This measures distinct addresses, not verified independent traders.

Sizes: $10/$25/$50/$100 in USDG. Detection delays: 2/5/15 seconds. Fixed exits: 1/5/15 minutes.
A separate prespecified +30%/-15% rule uses sell quotes and a two-second reaction delay;
it does not award a fill at the first chart threshold price.

The first 60% of signal time is the earlier period; the later 40% is the chronological
comparison. Earlier labels extending into the later period are embargoed. These rules are
prespecified and are not fitted on the later sample. There is no trained ML model here.
Tokens and wallet relationships can overlap across periods; this is not a token-independent
holdout or statistical proof. A later, separate collection period is still required.

## Execution and costs

Pool prices and active liquidity come from the most recent historical event available at
the cutoff. Liquidity modifications adjust active liquidity when the observed tick is
inside the changed range. State older than 120 seconds is rejected by default. Missing
routes, missing metadata, stale states and unsupported exits receive explicit reasons.

Finite-size quotes use concentrated-liquidity math and the recorded LP fee. The quote
must remain inside the current tick-spacing cell, where no new initialized tick can be
crossed. Larger orders that require unreconstructed tick liquidity are rejected.
This conservative quote boundary can select the covered sample; rejection rates matter.

Pool hooks can change fees or delivered amounts. Their contract execution is **not**
replayed. Hook routes therefore never receive strict quote status, and their modeled
returns are explicitly conditional. Dynamic fee changes between observed swaps remain
an assumption too. Network execution, routing and user-account settlement are not proven.

| Scenario | Assumed platform fee each side | Assumed extra friction each side | Assumed network cost each side |
|---|---:|---:|---:|
| Low cost | 0% | 0% | $0.01 |
| Middle cost | 1% | 1% | $0.05 |
| High cost | 2% | 2% | $0.25 |

These are **sensitivity assumptions**, not verified Fomo charges. Pool LP fees and finite
trade-size impact are included separately. USDG is the numeraire and its dollar peg is assumed.
Alert delays are scenarios; historical Fomopulse delivery timestamps do not exist in this store.
Block timestamps have one-second precision; entries use the complete state of the cutoff second.

## Results and missingness

- `fills.csv`: all classified wallet movements, including rejected transfer evidence.
- `signals.csv`: every eligible buy and its past-only strategy features.
- `wallet_activity.csv`: all roster wallets, including inactive wallets, and their actual signal counts.
- `pools.csv` and `tokens.csv`: resolved pool definitions and explicitly current metadata.
- `transaction_costs.csv`: observed receipt gas-used × effective-gas-price products in ETH.
  These are not verified fees charged to the named trader or estimates of future copying costs.
- `price_response.csv` and `price_response_results.csv`: separately labelled 15-minute marginal
  price changes after buys, including quotes that cannot support finite-size execution.
  This can test an association with later price movement; it is never reported as trading profit.
- `paper_trades.csv`: the complete cost/delay/size/horizon grid, including rejected entries
  and unresolved exits. A result is always marked `outcome_profit_label_valid=false`.
- `strategy_results.csv`: early/later/embargo comparisons and quote coverage.
- `trader_results.csv`: the prespecified middle-cost/$25/2-second/15-minute comparison.
- `tp_sl_trades.csv`: the separately registered exit rule.
- `backtest.json` and `REPORT.md`: machine-readable and plain-language results.

Win rates and means are explicitly closed-only; unresolved exits are not silently counted
as either wins or losses. A separate total-loss stress scenario treats unresolved entry
capital as lost. This is a stress assumption, not an observed loss label.

The $300 portfolio simulation reserves cash, includes network cost, prevents simultaneous
copies of the same token, and keeps unresolved capital tied up. Its reported drawdown marks
open positions at cost; it is not a true market-valued equity drawdown. Unlimited independent
trade totals must not be described as the account's achievable return.

No modelled result is exposed as a live app prediction or sent as a trading alert. A positive
table would still need more periods, full execution/hook validation, measured live latency,
transaction-cost reconciliation and independent prospective paper evaluation.

## Remaining work

Recover complete tick maps and hook execution where feasible; reconcile user-level platform
fees; broaden chronological coverage; validate on later days; measure prospective alert and
quote latency; add ownership-aware wallet grouping and Solana adapters. A continuously hosted
monitor has not been installed by these commands.

## Completed pilot: 5 September 2026, 00:00–02:00 UTC

Actual collection saved 2,401 receipts, 1,706 transaction inputs, 894,322 raw logs,
381 token metadata records, 598 hash-verified pool keys and 3,354 classified wallet
movements. Another 148 pool keys remain unresolved. The selected two-hour window
contains 451 eligible buy signals; all 294 roster wallets were queried.

The full grid produced 48,708 conditional trade scenarios, plus 451 TP/SL scenarios.
The code was rerun against the same saved evidence and produced identical hashes
for both `backtest.json` and `paper_trades.csv`. Twenty-one Python tests and the repository's
app tests, lint, type check and production build passed.

Frozen aggregate results are in `research/paper-copy-backtest/`. The detailed database
and all CSVs are retained locally; they are not bundled into the website or pushed to GitHub.
No ML profit model, always-running collector or app prediction was added.

The later-period, middle-cost/$25/2-second/15-minute scenarios illustrate why a chart
rise is not an executable edge: copy-all closed 81/178 signals, while the large-buy
rule closed only 4/10 and the multiple-wallet rule closed 13/32. Mean returns among
those modelled closes were +8.95%, −24.96% and −6.21%, respectively. Missing exits,
conditional contract behavior, repeated/correlated coins and the small single-window
sample prevent a validated-profit claim. The full report includes finite-cash results.

The public FrankDeGods-associated address supplied three eligible buys in this window.
The Rasmr-associated address supplied no eligible cohort buys (its broader saved window
contains swap activity); the TJR-associated address supplied no movements. A Kimchi
address was not identified in this frozen roster. These are coverage facts, not assessments
of the people or proof that a roster address is their only or personally controlled wallet.
