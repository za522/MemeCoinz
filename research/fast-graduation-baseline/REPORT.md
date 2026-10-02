# RED-PUMP fast-graduation baseline

## Verdict

There is genuine out-of-time ranking signal for the source observer's confirmed very-fast graduation event. The full model ranked the top 1% of the chronological test set at 12.828% confirmed fast graduation, versus 0.231% across the full test set (55.42x lift).

However, the first-observed market cap is overwhelmingly the strongest feature. This means much of the headline result is imminent-threshold detection, not narrative edge.

After removing market cap, the engineered model's top 1% contained 40 of 990 observed fast graduations (4.040%; 95% Wilson interval 2.981%–5.455%), or 17.45x the test prevalence.

The comparable plain-metadata/no-market-cap model found 34 of 990 (3.434%). Engineered context improved average precision from 0.013846 to 0.019756, but the top-1% confidence intervals overlap, so the incremental narrative/context edge is suggestive rather than established.

Daily top-1% lift exceeded 1x on 4 of 4 chronological test days.

## What this means

This is evidence of ranking signal for the source observer's confirmed very-fast graduation event. It is not evidence of trading profitability, because the dataset contains no trade path, executable entry, exit, fees, or slippage.

TIMEOUT rows are right-censored after observer visibility loss. They are used here only as the operational non-event class and must not be described as confirmed failures or 24-hour non-graduations.

## Test design

- Train: 2026-05-12T00:00:54.128000+00:00 to 2026-05-31T23:59:26.378000+00:00 (532,373 rows).
- Validation: 2026-06-01T00:00:26.453000+00:00 to 2026-06-05T23:59:03.598000+00:00 (131,792 rows).
- Test: 2026-06-06T00:00:06.153000+00:00 to 2026-06-09T23:34:14.905000+00:00 (98,926 rows).
- The four-day tracker warm-up and the partial final day were excluded.
- Every engineered context feature uses only launches observed strictly earlier than the current timestamp.

## Candidate status

The saved model is a research candidate only. It must not be surfaced as a live probability, alert, or trading instruction.
The class-balanced model outputs are ranking scores and are not calibrated probabilities.
This is one short chronological holdout with several reported model variants; replication on a later cohort is required before treating the result as stable.
