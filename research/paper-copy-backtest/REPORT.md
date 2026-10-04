# Historical paper-copy results

Run version: `paper-copy-v1`.

Period studied: 2026-09-05T00:00:00+00:00 to 2026-09-05T02:00:00+00:00. Checked all 294 public-roster wallets.
Saved 2401 transaction receipts, 894322 blockchain logs and 451 buy signals.
Early/later comparison starts at 2026-09-05T01:12:00+00:00. Early trades whose holding time overlaps that split are excluded from the comparison.

## What the numbers mean

These are conditional execution scenarios, not verified trading profits.
The wallet trades and pool activity are real. Our copied trade is simulated; its fees, notification delay and extra contract rules are not verified.
USDG is treated as worth $1. Missing buys/sells are kept visible, not turned into fake results.

## Prespecified $25 / 2-second delay / 15-minute exit / middle-cost scenario

Assumed costs: 1% platform fee + 1% extra execution friction + $0.05 network cost on each side. Pool fees and trade-size impact are also modelled.

| Period | Strategy | Signals | Modelled closes | Unresolved exits | Win rate of closes | Mean return of closes |
|---|---|---:|---:|---:|---:|---:|
| early | Copy every buy | 241 | 160 | 33 | 14.37% | -36.69% |
| later | Copy every buy | 178 | 81 | 24 | 24.69% | 8.95% |
| early | Unusually large buys | 8 | 5 | 3 | 40.00% | -29.22% |
| later | Unusually large buys | 10 | 4 | 3 | 25.00% | -24.96% |
| early | Several wallets buying | 109 | 90 | 15 | 2.22% | -61.52% |
| later | Several wallets buying | 32 | 13 | 5 | 30.77% | -6.21% |

## Did prices rise after the buys?

This separate association test uses the 2-second-delay / 15-minute price path.
It ignores trade size and costs and is NOT a paper-trading profit or proof the wallet caused the move.

| Period | Strategy | Signals | Observed price paths | Prices rose | Median price change |
|---|---|---:|---:|---:|---:|
| early | Copy every buy | 241 | 195 | 32.82% | -12.69% |
| later | Copy every buy | 178 | 118 | 60.17% | 3.69% |
| early | Unusually large buys | 8 | 5 | 60.00% | 3.96% |
| later | Unusually large buys | 10 | 7 | 71.43% | 14.61% |
| early | Several wallets buying | 109 | 93 | 4.30% | -66.31% |
| later | Several wallets buying | 32 | 24 | 66.67% | 7.20% |

## Could a $300 account take those trades?

Each period starts with a fresh $300. Only one position per coin is allowed, and tied-up money cannot be spent again.
Cash left is NOT total profit/loss: unresolved positions have no modelled exit value.

| Period | Strategy | Accepted buys | Cash left | Unresolved positions | Their original cost |
|---|---|---:|---:|---:|---:|
| early | Copy every buy | 25 | $120.68 | 6 | $150.00 |
| later | Copy every buy | 26 | $58.59 | 8 | $200.00 |
| early | Unusually large buys | 5 | $235.08 | 2 | $50.00 |
| later | Unusually large buys | 3 | $253.47 | 1 | $25.00 |
| early | Several wallets buying | 9 | $227.55 | 1 | $25.00 |
| later | Several wallets buying | 4 | $305.39 | 1 | $25.00 |

## Files

- `history.sqlite`: saved RPC evidence, receipts, pool events, timestamps and classifications.
- `fills.csv` and `signals.csv`: trade/transfer denominator and past-only features.
- `paper_trades.csv`: every delay/size/horizon/cost combination, including rejections and missing exits.
- `strategy_results.csv`, `trader_results.csv`, `portfolio_results.csv`, `backtest.json`: aggregate results and cash-constrained portfolios.
- `wallet_activity.csv`, `transaction_costs.csv`, `tokens.csv`, `pools.csv`: wallet activity and source details.
- `price_response.csv`, `price_response_results.csv`: separate price-only association test, not trading profits.
- `tp_sl_trades.csv`: +30% / -15% exit rule with two-second exit reaction delay.

## Limitations

- Historical roster was selected after the cohort; survival/selection bias remains.
- Wallet handles are public associations, not verified identity or independence.
- USDG is the numeraire; dollar peg and redemption are assumed.
- Latest decimals/symbols are tagged current; immutable decimals are assumed for modelling.
- Signal features use only earlier fills; all-wallet swaps do not establish independent convergence.
- Detection delays are assumed, not measured historical Fomopulse alert times.
- Historical block timestamps have one-second precision; entry uses end-of-second pool state.
- Pool quotes are finite-size within one tick-spacing cell. Tick crossings are rejected.
- Pool hooks/dynamic fee changes are not replayed; nonzero-hook results are conditional scenarios.
- Observed LP fees are used; platform fees, extra friction and network costs are assumptions.
- Incomplete/stale paths and missing exits are retained. Closed-only win rates are coverage-selected.
- Each simulated trade uses the actual historical market path; large joint copy impact is not simulated.
- No statistical independence, confidence interval or validated profitable edge is claimed.
