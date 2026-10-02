# RED-PUMP fast-graduation baseline

## The plain result

The experiment found a real out-of-time ranking signal for one narrow event: whether the RED-PUMP observer confirmed a very fast Pump.fun graduation.

It did **not** test whether a trade would make money. The source has no executable entry, exit path, fees, slippage, or post-entry return label.

The untouched test period contained 98,926 launches and 229 confirmed events, a 0.231% base rate.

| Model | Test average precision | Top 1% confirmed events | Top 1% rate | Lift over base rate |
|---|---:|---:|---:|---:|
| Engineered boosted, including first-observed market cap | 0.218210 | 127 / 990 | 12.828% | 55.42x |
| Plain metadata boosted, no market cap | 0.013846 | 34 / 990 | 3.434% | 14.84x |
| Engineered boosted, no market cap | 0.019756 | 40 / 990 | 4.040% | 17.45x |

The market-cap-free engineered result has a 95% Wilson interval of 2.981%–5.455%. Its daily top-1% lift exceeded 1x on all four test days.

## What the result actually says

The full model's strongest input was first-observed market cap by a very large margin. The source may first observe a launch after early buying has already occurred. The 55x headline therefore mostly detects coins already nearing the graduation condition; it is not a clean narrative edge.

After market cap is removed, the highest-ranked inputs are description length, Telegram presence, social-link count, prior 24-hour name reuse, X presence, metadata completeness, launch hour, symbol reuse, copy pressure, and recent launch congestion.

The engineered no-market-cap model improves average precision by about 43% relative to the plain metadata no-market-cap model. Its top-1% rate is also higher, but the models' confidence intervals overlap. The safest conclusion is: **metadata and launch context contain promising ranking information, but this run does not establish a distinct narrative edge.**

## Target and censoring

RED-PUMP v1.4 confirms 1,651 fast graduations. Its `TIMEOUT` value means the rolling observer lost visibility; it is not a confirmed failed launch or a 24-hour non-graduation.

For this operational study only, confirmed graduations are the positive class and observed timeouts are the non-event comparison class. Every metric must therefore be named **observer-confirmed fast graduation**, not success, profit, or pump probability.

## Leakage controls

- The source SHA-256 hashes are checked before training.
- Each launch becomes available no earlier than its on-chain creation time.
- Context features use only launches observed strictly earlier than the current row.
- Rows sharing the same timestamp are scored before any of them enter prior-history counters.
- The first four days are used only as context warm-up.
- Training, validation, and testing are chronological; no future row enters an earlier split.
- The final partial source day is excluded.

| Split | UTC dates | Rows | Confirmed events |
|---|---|---:|---:|
| Train | May 12–31, 2026 | 532,373 | 1,088 |
| Validation | June 1–5, 2026 | 131,792 | 266 |
| Test | June 6–9, 2026 | 98,926 | 229 |

## Reproduce it

Download the RED-PUMP v1.4 launch file, outcome file, and SHA-256 manifest from the [publisher's Zenodo record](https://zenodo.org/records/17946822). Then create a separate research environment with NumPy and scikit-learn and run:

```bash
python scripts/train_fast_graduation_baseline.py \
  --launches /path/to/red_pump_2026_v1_launches.jsonl.gz \
  --outcomes /path/to/red_pump_2026_v1_outcomes.csv.gz \
  --manifest /path/to/SHA256SUMS.txt \
  --taxonomy lib/narrative/taxonomy.json \
  --output-dir research/fast-graduation-baseline
```

The run writes `results.json`, `REPORT.md`, the test set's top 100 ranked rows, and two candidate-only model files. Python pickle files must be loaded only when produced locally from trusted code.

## Artifact status

The artifacts are research candidates. They are not connected to the app, alerts, or trading. The class-balanced boosted-model scores are useful for ordering launches but are not calibrated probabilities.

This is one short chronological holdout and the report compares several model variants. A later, untouched cohort must replicate the result before it can be described as stable.

The next model that can answer the user's trading question requires point-in-time market paths and size-specific executable outcomes, including fees and slippage.
