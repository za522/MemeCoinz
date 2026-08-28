# Changelog

User-visible project changes are recorded here.

## Unreleased

- Added a reproducible import path for the corrected CC-BY-4.0 RED-PUMP-2026-v1 corpus, covering 860,194 unique launches from 8 May to 10 June 2026.
- Added a compact D1 cohort index, private hash-verified R2 source storage, exact-count finalization, and a public paginated cohort/status API.
- Added an unlinked private operator upload surface so an authenticated owner can stream the frozen files into an owner-only deployment without making the site public.
- Split Coins into two plain dataset choices, **Live now** and **Historical cohort**, so a user can see the real stored denominator without confusing it with the bounded current feed.
- Preserved the publisher's v1.4 correction: 1,651 observed fast graduations are positive evidence, while 831,290 `TIMEOUT` rows are right-censored—not failures, 24-hour outcomes, or valid negative model labels.
- Kept 27,253 launches without a published outcome explicitly unknown instead of coercing them into the right-censored class.
- Preserved two sub-second source clock discrepancies in the normalized archive while clamping app-facing availability to the on-chain creation time, so no feature can appear available before launch.
- Calculated chronology-safe metadata/narrative features for all 860,194 rows: theme, classifier confidence, metadata completeness, social links, name/symbol reuse, theme and total launch rates, novelty, copy pressure, and observation lag.
- Added 60 descriptive cohort association rows spanning narrative, metadata, novelty, copy pressure, reuse, launch rate, and lag. Rates use confirmed fast graduation as a lower-bound outcome and keep censored/unknown rows in the denominator.
- Added protected, idempotent deployment upload support for all 860,194 calculated feature rows and the 60 precomputed association buckets.
- Added a free direct collector with live/archive modes, checkpointed public Solana RPC scanning, exact Pump decoding, public DEX Screener/Jupiter enrichment, protected bounded ingestion, and optional watch mode.
- At the 28 August 2026 verification checkpoint, local free-source passes had persisted two canonical Pump launches, 51 real observations (including 37 size-specific execution quotes), and nine elapsed point-in-time snapshots. The watcher continues after that checkpoint. This is an operational proof, not population coverage or predictive validation.
- Preserved confirmed canonical asset fields monotonically and rehydrated stored market observations when a runtime cannot currently reach upstream providers.
- The cohort adds real scale, calculated metadata/narrative research, and descriptive associations but not transaction histories, complete price paths, wallet graphs, historical social text, or executable profit labels; no trained edge is claimed.

## 0.4.1 · 2026-08-28

- Added a credential-free, browser-direct DEX Screener fallback when the deployed server cannot reach public providers and therefore returns no coins.
- The fallback uses only public CORS-enabled latest-profile and current-pair endpoints, sends no authorization header, and keeps its rows selection-biased, noncanonical, read-only, and excluded from model training.
- Preserved the selected real coin identity and current market fields when its server-side point-in-time report correctly returns insufficient data.
- A clean 0.4.1 production build measured 147,229 bytes gzip across comparable client assets (141,521 JavaScript + 5,708 CSS), 3,385 bytes above 0.4.0 and 7,261 bytes (+5.2%) above the 0.3.0 baseline. The research-console chunk measured 29,868 bytes gzip.

## 0.4.0 · 2026-08-28

### Added

- A real Coins feed that requests recent Pump and PumpSwap launches automatically, supports manual refresh and local filters, and opens an exact-mint report.
- Exact official Pump `create`/`createV2` and PumpSwap pool/migration decoding over bounded Solana JSON-RPC signature pages, with scan counts, event ranges, continuation cursors, fidelity, and partial-coverage reasons.
- An explicitly selection-biased DEX Screener paid-profile fallback when canonical bounded discovery returns no usable rows, plus optional Solana Tracker acceleration when an authorized key is configured.
- Real per-mint history collection for recent transactions, balance changes, transfers, fee payer/fees, supply, largest token accounts, and priority-fee regime, with known reconstruction limits.
- A status-only collection control and authenticated bounded provider collector. GET performs no fetch/write; POST caps the window/pages/order sizes and gates metered calls behind request authorization, a global cost switch, and server credentials.
- Bounded adapters for Helius address history; Solana Tracker trades, holders/chart, bundler/risk classifications, and deployer history; X exact-mint/official-URL/full-name posts and counts; Jupiter read-only size-specific round trips; and current Jito tip context.
- Per-report safe-current collection evidence: public coin research may use timestamped public-lite Jupiter/Jito probes but never authorizes metered Helius/Tracker/X/keyed-Jupiter calls or backdates current rows.
- Conditional D1 persistence for discovered assets and observations. API responses now distinguish written, read-only, unavailable, and failed storage states.
- Conditional upsert of elapsed, leakage-audited feature snapshots; future/misaligned rows are refused and storage failure is explicit but nonfatal.
- A point-in-time feature engine spanning lifecycle/flow, liquidity/execution, ownership/creator, coordination/wash clues, narrative/paid attention, market regime, and evidence quality.
- Executable outcome definitions that keep labels pending until the horizon and complete exit path mature instead of treating missing exits as losses.
- A protected, bounded manual outcome materializer that writes only mature labels from complete cutoff-aligned `execution_path` observations and exposes pending/unavailable/invalid/missing-path counts.
- A supervised research pipeline with point-in-time leakage audit, token-grouped chronological walk-forward validation, calibration, PR-AUC, Brier score, precision-at-k, net return/EV, drawdown, feature relationships, and family ablations.
- A model API that trains only when persisted point-in-time examples meet minimum cohort/class requirements and otherwise reports **Insufficient data**.
- Protected persistence for immutable candidate/validated model artifacts. Validated status is refused unless the calibrated chronological serving gates pass.
- Validated-artifact lookup in the coin report path, with eligible predictions persisted in shadow mode and no trade action.
- A disabled-by-default, protected Telegram delivery runner for threshold-passing validated shadow predictions, with dry-run support and per-prediction/channel deduplication.
- A protected POST-only pipeline runner for one bounded end-to-end maintenance pass: discovery, detail/optional advanced collection, every elapsed clock/cutoff snapshot, validated-only shadow lookup, mature outcomes, candidate-only training, and optional Telegram delivery.

### Changed

- Replaced the synthetic-first Coins experience with real source rows; an exact-mint lookup remains available as a secondary path.
- Reframed the Coin report around one exact mint, a launch/graduation reference clock, registered cutoffs, observed versus engineered evidence, hindsight outcomes, and model readiness.
- Updated product and design memory so the feed, report, source coverage, missingness, and model truth are the durable three-screen contract.
- Kept opportunity, integrity risk, tradability, and evidence quality separate; no opaque Buy Score or automatic-trade action was introduced.
- Removed the legacy public synthetic-research fixture route and dead client report path so the shipped screens and APIs do not mix invented and real coin evidence.

### Data and limitations

- The public RPC collector is request-driven and intentionally bounded. It is not a continuous collector, an archive-complete backfill, or proof that every launch is present.
- DEX Screener latest profiles reflect paid-profile activity and are not a neutral denominator of Pump launches.
- Historical RPC availability time is reconstructed from block time plus a documented assumption when prospective arrival time was not recorded.
- The current environment has no Helius, Solana Tracker, X, or production Jupiter credential and no complete historical cohort.
- Advanced adapters are implemented but credentialed branches have not produced a live local corpus. Jupiter/Jito probes are current request-time evidence, not continuous or historical collection.
- X archive event time and Solana Tracker historical fields keep retrieval-time availability when original indexing latency is unknown; mutable engagement/profile and risk fields are never silently backdated.
- No model is presented as trained or validated until enough real, matured, point-in-time examples exist. No predictive edge or profitability is claimed.
- Telegram delivery remains disabled and unconfigured in this environment; no eligible validated prediction or delivered alert is claimed.
- The manual pipeline runner has no cron/background trigger, defaults metered providers and alert delivery off, and can never promote a candidate model or submit a transaction.
- The executable-label engine and bounded manual materializer exist, but no scheduler or current collector builds complete `execution_path` sequences across each horizon; no usable outcome cohort is claimed.
- Narrative embeddings, resolved holder-owner graphs, archive-complete bundle evidence, a running alert scheduler, paper trading, and automatic trading remain unavailable.

### UI and performance

- No external UI package, chart library, data grid, or animation runtime was added.
- The feed is bounded to at most 100 rows per response and token artwork reserves dimensions and lazy-loads.
- A clean 0.4.0 production build measured 143,844 bytes gzip across the comparable client assets (138,117 JavaScript + 5,727 CSS), 3,876 bytes (+2.8%) above the 0.3.0 baseline; this is recorded as a cost, not an improvement claim.
- The research-console chunk measured 26,544 bytes gzip, up from 24,015 bytes.

## 0.3.0 · 2026-08-28

### Added

- A three-screen product structure: Coins, Coin report, and Data & methods.
- A real current-mint lookup boundary using server-only Solana, DEX Screener, Jupiter, and optional credentialed enrichments.
- A source registry that separates live checks, required credentials, historical limits, manual references, and policy-disabled sources.
- Concise release notes and a searchable beginner terminology appendix inside Data & methods.
- A refreshed forensic-research social card with the product line “Know what was known.”

### Changed

- Replaced the former Research Lab, Data Coverage, and Live Shadow product contract with one find-understand-audit flow.
- Made **Tradability** the beginner-facing label for execution feasibility while retaining executability as the technical definition.
- Moved pillar detail, formulas, provenance, and teaching behind progressive disclosure in the Coin report contract.
- Strengthened the forensic daylight design rules for body contrast, focus, responsive reading, and honest empty/partial/error states.

### Performance

- Added no external UI runtime package; existing React, semantic HTML, and CSS remain the interface foundation.
- Reduced the comparable production client asset set from about 150,814 to 139,968 bytes gzip, including a CSS reduction from 11,437 to 4,892 bytes gzip.
- Reduced the research-console client chunk from 28,310 to 24,015 bytes gzip.
- Verified no page-level horizontal overflow at 1440, 768, 390, or 320 pixels.

### Fixed

- Removed the duplicate global and local navigation systems in favor of exactly three top-level destinations.
- Removed Vinext's failing production `next/link` prefetch path from the three static destinations; a fresh production browser run is console-clean.
- Replaced the visually dominant synthetic opportunity number with four independent, plainly labelled assessments and disclosed component scores.
- Stopped base58-shaped but unconfirmed addresses from appearing as verified tokens, and tied DEX identity and price fields to the requested mint.
- Preserved available DEX evidence when either the pool or paid-order subrequest fails instead of discarding the whole provider result.
- Enforced event, observation, and availability timestamps at every replay cutoff and added a delayed-observation regression case.
- Exposed each source's credential name, last check, implementation state, official documentation, and declared data scope without calling planned collectors current use.

### Data and limitations

- The complete report remains one clearly labelled synthetic fixture and is not a trained or validated signal.
- Public source probes and current mint lookups are real, but they are not a historical launch collector or persisted research cohort.
- Helius, Solana Tracker, and X require server credentials and remain unavailable when those keys are absent.
- Pump/PumpSwap program IDs are registered, but decoding, backfill, continuous collection, and D1/R2 ingestion are not running.
- No validated trading edge, paper portfolio, prospective shadow prediction stream, or automatic trading is available.
