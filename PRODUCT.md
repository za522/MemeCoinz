---
name: "MemeTrace"
description: "A point-in-time research app for discovering Solana memecoin launches, comparing their evidence, and testing whether early information predicts executable outcomes."
register: "product"
updated: "2026-08-29"
---

# Product

## Purpose

MemeTrace helps a beginner or quantitative researcher answer one narrow question: **using only information available at a chosen moment after a Solana memecoin launched or graduated, could we have identified coins that later produced a defined, executable outcome?**

The product combines a real launch feed, an evidence report for one exact mint, and a leakage-safe research pipeline. It is not an automatic trader, a profitability promise, or financial, legal, or compliance advice.

## People

- Primary user: a curious non-expert who wants to investigate new memecoins without learning several terminals first.
- Secondary user: a researcher who needs exact definitions, missingness, timestamps, denominators, and reproducible model validation.
- Starting knowledge: mixed. Necessary specialist terms must have a short plain-English definition.
- Setting: desktop research first, with tablet and phone support for monitoring the feed or opening a coin report.
- Accessibility: WCAG 2.2 AA target, visible focus, keyboard and touch operation, Reduced Motion, and no colour-only state.

## Core jobs

1. Review a real, automatically refreshed feed of recently discovered Pump/PumpSwap coins and compare observed market, flow, and research fields.
2. Open one exact mint and inspect what the available evidence supports at `30s`, `1m`, `5m`, `15m`, or `1h` after launch or graduation.
3. Audit where every field came from, how outcomes and models are defined, how much coverage exists, and what is still unavailable.

The first broad historical launch index is the corrected RED-PUMP-2026-v1 corpus (860,194 unique Pump launches observed from 8 May to 10 June 2026). Every row now has a chronology-safe metadata/narrative feature record and the app reports descriptive feature associations against confirmed fast graduation. This is useful research evidence, but not a profitability label: its `TIMEOUT` rows are right-censored after a short rolling-feed visibility window and must never be treated as failed or unprofitable coins.

## Screen map

MemeTrace has exactly three top-level screens. Research families are columns or report sections, not additional navigation.

| Screen | One primary task | Content that leads | Success |
|---|---|---|---|
| **Coins** | Explore coins | A clearly separated live feed and historical launch cohort | The user can browse current discovery or the stored historical denominator without confusing their evidence coverage |
| **Coin report** | Understand this coin | Exact identity, reference clock, cutoff, point-in-time evidence, missing fields, outcomes, and model state | The user can separate observations from engineered features, hindsight labels, and untrained predictions |
| **Data & methods** | Audit the research | Source interfaces and rights, collection coverage, feature/label definitions, validation, releases, and terminology | The user can trace a claim and see the prerequisites for a defensible result |

Do not restore Research Lab, Data Coverage, Live Shadow, feature-family tabs, or a documentation menu inside every screen.

## Screen contracts

### Coins

- Load a real feed automatically and offer a manual refresh. Do not make the user paste a contract before seeing coins.
- Use **Explore coins** as the task heading and provide two plainly labelled datasets: **Live now** and **Historical cohort**. Never blend their rows or coverage claims.
- Treat the feed as **recent discovery from bounded requests**, not a complete list of every launch. Show the active discovery sources, scan counts, oldest/newest event times, continuation state, and warnings.
- Prefer exact Pump/PumpSwap create events decoded from Solana. When that bounded scan returns no usable launches, a DEX Screener paid-profile feed may supply a clearly labelled, biased fallback; an authorized Solana Tracker key may accelerate discovery.
- If a deployed host cannot reach public providers and returns no coins, a credential-free browser request to DEX Screener's public profile/pair endpoints may recover real current rows. Mark them as browser-direct, unpersisted, selection-biased, noncanonical, and ineligible for training.
- Allow local filtering by exact mint, name, ticker, and lifecycle stage. Ticker matching is navigation only, never identity proof; every report is keyed by the exact mint.
- Keep observed market/flow fields separate from calculated research fields. A missing value is **Unavailable**, never zero.
- Do not show a synthetic coin as the default result, a winner-only list, or an implied recommendation.

### Coin report

- Lead with name, ticker, exact mint, lifecycle stage, data mode, checked time, and source fidelity.
- Let the user choose the reference clock (`launch` or `graduation`) and cutoff (`30s`, `1m`, `5m`, `15m`, `1h`). A graduation cutoff is unavailable if no graduation time is known.
- At each cutoff, use only records whose event and availability times are no later than the decision time. Never fill a historical cutoff with the latest market value.
- Distinguish four things: **observed inputs**, **engineered features**, **matured outcomes known only in hindsight**, and **model output**. Do not style an engineered heuristic as a probability.
- Keep opportunity, integrity risk, tradability, and evidence quality separate. Never average them into one Buy Score.
- Expose feature families for lifecycle/flow, liquidity/execution, ownership/creator, coordination/wash clues, narrative/paid attention, market regime, and source fidelity. Each family must show coverage and missing reasons.
- Coordination is probabilistic. Common funders, early-buyer recurrence, atomic ordering, synchronized transfers, and exits are clues, not proof of common control or misconduct.
- A model prediction may appear only from a versioned trained artifact that passed point-in-time audit and chronological validation. Otherwise show **Not trained** or **Insufficient data**.
- Automatic trading remains disabled. No report may use “buy now,” “safe,” or equivalent instruction language.

### Data & methods

- Combine source registry, connection health, current collection coverage, data rights, feature definitions, outcome definitions, model validation, releases, and terminology in one auditable reading screen.
- For each source, state the exact interface, credential, time coverage, fidelity, limitation, and commercial-use boundary.
- Explain `event_at`, `observed_at`, `available_at`, reference clocks, cutoffs, fidelity, missingness, executable labels, calibration, and walk-forward validation in plain language.
- Connection health means an interface responded. It does not mean collection is continuous, historical coverage is complete, or the app has a predictive edge.

## Research contract

- Unit of analysis: one exact mint × one reference clock × one cutoff.
- Registered cutoffs: `30`, `60`, `300`, `900`, and `3,600` seconds.
- Example primary label: whether a stated USD position reached a net executable `2×` before falling to `0.5×` within a stated horizon, after modeled entry/exit costs and only when the observation path is complete.
- Labels remain pending until the full horizon and its coverage have matured. Missing exits do not silently become losing trades.
- Validation is chronological and token-grouped. A token cannot appear in both training and test, training labels must have matured before the test period, and the pipeline reports calibration, PR-AUC, Brier score, precision at the selected fraction, net return/EV, drawdown, feature relationships, and family ablations.
- Training is gated by minimum cohort and class counts. Passing the software tests is not evidence that a trading model works.

## Inputs and data

- User inputs: feed query, stage and column filters, refresh choice, exact mint lookup, reference clock, cutoff, report disclosures, glossary query, and glossary category.
- Canonical public input: bounded Solana JSON-RPC signature/transaction reads for the official Pump and PumpSwap programs, decoded only when exact supported instruction discriminators match.
- Current per-mint public input: recent mint transactions, token supply, largest token accounts, recent priority-fee samples, DEX Screener token pairs/orders, and Jupiter current price where available.
- Partial discovery fallback: DEX Screener latest token profiles for Solana. This is paid-profile discovery, not a neutral or complete launch denominator.
- Protected bounded collection input: Helius address history; Solana Tracker trades, holders/chart, bundler/risk classifications, and deployer history; X exact-mint/official-URL/full-name post search and counts; current Jupiter size-specific round-trip quotes; and current global Jito tip context. Metered Helius/Tracker/X or keyed Jupiter calls require explicit request authorization, the global cost gate, and the provider credential. No such provider credential is installed in the current local environment.
- Protected manual pipeline input: one bounded request may orchestrate discovery, one detail load per selected coin, optional advanced collection, every elapsed clock/cutoff snapshot, exact validated-artifact shadow lookup, matured-outcome materialization, candidate-only training, and optional Telegram delivery. It is an operator runner, not a scheduler or trading engine.
- Manual/reference-only sites: Pump.fun consumer pages, Fomo.family, Photon MemeScope, and memescope.net are not scraped.
- Free direct collector: an operator process queries the official public Solana RPC, applies the same exact Pump decoder, enriches confirmed mints through public DEX Screener and Jupiter reads, persists bounded normalized evidence through a protected local route, checkpoints archive progress, and can repeat in watch mode. Public RPC remains best-effort and has no archive-completeness guarantee.
- Persistence: normalized assets/observations and eligible elapsed feature snapshots are written when a Cloudflare D1 `DB` binding is present. The corrected RED-PUMP importer keeps its browseable compact launch index plus chronology-safe calculated feature layer and aggregate associations in D1; verified raw gzip sources can additionally be preserved privately in R2, with that status reported separately. Existing aligned outcomes can be read; a separate protected, bounded materializer writes only labels backed by complete, mature, cutoff-aligned `execution_path` rows. Protected research actions can persist immutable candidate/validated model artifacts; a matching validated artifact can produce and persist a shadow prediction. The alert runner records deduplicated Telegram delivery attempts. Without D1, live research responses still return with storage marked unavailable/read-only.
- Repository research code: point-in-time feature derivation, executable outcome labels, dataset leakage audit, regularized logistic ensemble training, calibration, chronological validation, relationships, ablations, and prediction intervals.
- Unknown or unavailable in the current local environment: complete transaction/outcome history for the broad launch cohort, durable hosted scheduling, actual historical provider latency, resolved holder ownership, full social narrative bodies/embeddings, authenticated Helius/Tracker/X data, archive-complete bundle evidence, trained model performance, an eligible validated artifact, configured Telegram delivery, paper trading, and live trading.

## Current release: 0.5.0

### Available

- A real Coins feed backed by bounded public Solana Pump/PumpSwap discovery, with honest coverage and cursors.
- A clearly labelled DEX Screener paid-profile fallback and optional Solana Tracker acceleration.
- Real per-mint detail/history collection for recent transactions plus current supply, largest accounts, priority-fee regime, market enrichment, provenance, and missingness.
- A status-only collection control plus authenticated, bounded per-mint provider collection. Public GET consumes no quota; protected POST can collect the implemented Helius, Solana Tracker, X, Jupiter, and Jito evidence under explicit cost and credential gates.
- Conditional D1 persistence for assets, observations, and eligible point-in-time feature snapshots; existing aligned outcomes are read when present, and every write/read state is reported.
- A point-in-time feature and executable-label engine spanning every planned research family, while preserving unavailable inputs as unavailable.
- A protected manual outcome materializer that refuses pending, partial, missing, invalid, or misaligned execution paths instead of converting them into losing labels.
- A strict supervised-model pipeline that audits leakage, trains only with enough real data, and returns an explicit insufficient-data state otherwise.
- A protected manual pipeline runner that executes one bounded end-to-end maintenance pass across at most 10 coins. Metered collection is off by default, Telegram is opt-in/dry-run by default, and candidate models are never promoted automatically.
- Protected candidate/validated model-artifact persistence, validated-only shadow prediction serving, and a disabled-by-default Telegram delivery runner with probability thresholding and delivery deduplication.
- A separate historical launch view backed by the corrected 860,194-launch RED-PUMP corpus, with raw-source hashes, exact import counts, pagination, and censored outcomes preserved as unknown.
- Chronology-safe calculated metadata/narrative features for all 860,194 historical launches, plus descriptive lower-bound associations that retain censored/unknown rows in the denominator.
- A free direct collector with live/archive modes, checkpointed continuation, exact Pump decoding, public DEX/Jupiter enrichment, protected ingestion, and optional watch mode. At the 28 August 2026 verification checkpoint, local runs had persisted two canonical launches, 51 observations (including 37 size-specific execution quotes), and nine elapsed point-in-time snapshots without paid credentials. The watcher continues to append evidence after that checkpoint.
- Exactly three user-facing screens and no synthetic coin as the default experience.

### Not available or not yet demonstrated

- The bounded live scan and free direct collector are not a complete launch denominator or guaranteed archive backfill; watch mode is an operator process, not a durable hosted scheduler.
- The broad launch cohort is large, but it lacks complete transaction paths and valid executable winner/loser labels, so it cannot by itself train or validate the intended model.
- No matching validated model artifact or eligible shadow prediction currently exists, so the alert runner has nothing it may truthfully deliver.
- No scheduler or current collector builds complete `execution_path` sequences across an outcome horizon; the manual materializer can label only qualifying paths that already exist in D1.
- No forecast, feature importance, confidence interval, or profitability claim is shown as validated merely because its calculation code exists.
- No Helius, Solana Tracker, X, or production Jupiter credential is installed here.
- Therefore the credentialed collector branches are implemented but have not produced a credentialed local corpus; the free public collector's verified rows do not imply Helius/Tracker/X coverage.
- DEX Screener paid-profile discovery is selection-biased and cannot measure the base rate of all Pump launches.
- Historical `available_at` reconstructed from block time plus an assumption is lower fidelity than prospectively recorded arrival time.
- Holder account ownership, common-funder graphs, atomic bundle membership, narrative authenticity, and size-specific historical exits remain incomplete when the required observations are absent.
- Telegram delivery is disabled and unconfigured by default and runs only through a protected request; there is no scheduler or evidence of a delivered alert in this environment.
- The manual pipeline has no cron or background trigger; it does not make the request-driven feed continuous or the cohort complete.
- No wallet connection, order submission, paper portfolio, or automatic trading.

## Later

- Operate the free collector continuously and reconcile every decoded page; add a production archive/streaming provider only when free public-RPC retention or rate limits prevent complete coverage.
- Schedule the authenticated collector prospectively so X identity-matched posts, Jupiter size-specific routes, Jito context, provider failures/latency, and source health are actually retained; add embeddings, exact slot ordering, wallet-owner resolution, and token-specific bundle evidence where lawful and technically available.
- Collect complete execution paths and schedule feature/outcome materialization for all cutoffs, train only after the cohort passes audit, then publish walk-forward results with denominators and uncertainty.
- Operate the optional alert runner only after a validated artifact, explicit probability threshold, delivery credentials, and scheduler controls are reviewed; alerts remain research notifications, not trade instructions.
- Consider paper execution and then constrained live execution only after validated out-of-sample evidence, operational controls, provider terms, jurisdiction review, and a separate explicit authorization.

## Non-goals

- A casino terminal, urgency feed, one-tap trading surface, or automatic buy trigger.
- A single opaque score that hides conflicting evidence.
- A winner-only leaderboard or performance claim without the full launch denominator.
- Proof of identity, intent, manipulation, or guilt from wallet clustering.
- Scraping consumer pages or reverse-engineering private endpoints.
- Presenting current data, reconstructed timestamps, or a paid-profile list as complete historical evidence.

## Product rules

- Exactly three top-level screens: Coins, Coin report, and Data & methods.
- Every screen has one primary task, and that task is its clearest heading.
- Real coins and real source states lead; documentation and teaching stay secondary.
- Every metric identifies its taxonomy, reference clock/cutoff, source/fidelity, and missing state where relevant.
- A missing value stays unavailable; it is never silently changed to zero or borrowed from the future.
- Opportunity, integrity risk, tradability, and evidence quality remain separate.
- Claims match actual source responses, coverage, implementation, and validation state.
- Follow `DESIGN.md` for every interface change.
