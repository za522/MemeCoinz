# MemeTrace

MemeTrace is a research-grade Solana memecoin application. It discovers real recent Pump/PumpSwap coins, preserves point-in-time evidence for exact mints, derives timestamp-safe features and executable outcome labels, and provides a supervised-model pipeline that refuses to claim a forecast when the cohort is insufficient.

It is not an automatic trader or evidence of a profitable strategy.

## What is implemented

- Exactly three top-level screens: **Coins**, **Coin report**, and **Data & methods**.
- A request-driven real coin feed using bounded Solana Pump/PumpSwap scans, optional Solana Tracker discovery, stored D1 rows, and a clearly labelled DEX Screener paid-profile fallback. If the host cannot reach public providers and returns no rows, the browser may call DEX Screener's public CORS-enabled profile/pair endpoints directly; that fallback uses no credential and is never a training cohort.
- Exact Pump `create`/`createV2`, Pump `migrate`, and PumpSwap `createPool` discriminator matching from the official public IDLs. Transactions that merely touch a program are not called launches.
- Current market enrichment from DEX Screener pair snapshots and Jupiter Price v3.
- Real per-mint detail collection from recent Solana transactions, token supply, largest token accounts, and recent priority-fee samples, with explicit history bounds and reconstruction limits.
- A status-only advanced-collection control and authenticated bounded collector for Helius address history; Solana Tracker trades/holders/risk/bundlers/deployer history; X identity-matched posts/counts; Jupiter read-only round-trip quotes; and current global Jito tip context.
- Three independent metered-call gates: an authenticated execution request, `TOKEN_ENRICHMENT_METERED_ENABLED=true`, and the provider credential. Public status GETs never consume provider quota or write D1.
- Conditional D1 persistence for assets, observations, and eligible elapsed feature snapshots. The response remains usable and reports storage unavailable when no D1 binding exists.
- Point-in-time feature derivation at `30s`, `1m`, `5m`, `15m`, and `1h` using both `eventAt <= decisionAt` and `availableAt <= decisionAt`, with eligible elapsed rows conditionally upserted to D1.
- Feature families for lifecycle/flow, liquidity/execution, ownership/creator, coordination/wash clues, narrative/paid attention, market regime, and evidence quality. Missing inputs stay null.
- Executable outcome labels that include order size/costs and remain pending until the full observation horizon matures.
- A protected, bounded outcome materializer that writes only complete, mature, cutoff-aligned `execution_path` labels and reports every rejected/pending/missing path.
- A regularized logistic-ensemble research pipeline with leakage audit, token-grouped chronological walk-forward validation, calibration, PR-AUC, Brier score, precision-at-k, return/EV, drawdown, feature relationships, and family ablations.
- An explicit **Insufficient data** result when minimum real cohort/class requirements are not met.
- A protected manual pipeline runner for one bounded discovery → detail/collection → feature/prediction → outcome → candidate-training pass, with optional shadow-alert delivery. It never promotes a candidate model, submits a transaction, or installs a scheduler.
- Protected persistence for immutable candidate/validated model artifacts, validated-only shadow predictions, and deduplicated alert-delivery records.
- An optional Telegram shadow-alert runner that is disabled by default, thresholded, and unable to submit a trade.
- A protected, idempotent importer for the corrected CC-BY-4.0 RED-PUMP-2026-v1 corpus: 860,194 unique launches, immutable source files in R2, and a compact browseable D1 index with censored outcomes kept distinct from losses.
- Server-only source registry and exact source/rights documentation.

## What is not yet claimed

- The live feed is bounded and request-driven, not a complete denominator or always-on collector.
- DEX Screener latest profiles are a paid-profile, selection-biased fallback rather than all Pump launches.
- Browser-direct fallback rows are current and real but are not written to D1; refreshing or opening the same mint later does not create historical coverage.
- The RED-PUMP corpus is a broad launch cohort, but its rolling top-50 observer loses most launches after roughly 2.77 minutes. It confirms 1,651 fast graduations; its 831,290 `TIMEOUT` rows are right-censored, not failures, and cannot train the intended profit model as negative labels.
- No complete transaction-level historical cohort with mature executable outcomes has been established, and no model is currently demonstrated as trained or validated.
- No scheduler or current collector builds full `execution_path` sequences over the outcome horizon, so the manual materializer does not by itself create a usable cohort.
- No Helius, Solana Tracker, X, or production Jupiter credential is installed in the current local environment.
- The credentialed collector code therefore has no live local corpus or verified provider coverage; current Jupiter/Jito probes are still request-driven rather than continuous history.
- Narrative embeddings, owner-resolved holder graphs, complete common-funder/bundle evidence, and historical size-specific route quotes remain unavailable unless those exact observations are collected.
- Telegram delivery is disabled and unconfigured in the current environment; without a real matured cohort and matching validated artifact, there are no eligible predictions to send.
- No browser settings surface or background scheduler currently operates the alert runner.
- The manual pipeline endpoint is request-driven, capped at 10 coins, and not a continuous collector or cron job.
- No wallet connection, paper portfolio, trade submission, or automatic trading.
- Pump.fun consumer pages, Fomo.family, Photon MemeScope, and memescope.net are not scraped.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Server configuration

Copy `.env.example` to `.env.local` and add only credentials and endpoints you are authorized to use:

```bash
# Public fallback is suitable only for light local use.
SOLANA_RPC_URL=https://api.mainnet.solana.com

# Required for bounded archive backfill.
SOLANA_ARCHIVE_RPC_URL=

# Optional server-only providers.
HELIUS_API_KEY=
SOLANA_TRACKER_API_KEY=
X_BEARER_TOKEN=
JUPITER_API_KEY=

# Keep metered enrichment off until quota and rights are reviewed.
TOKEN_ENRICHMENT_METERED_ENABLED=false

# Required for protected backfill, collection, pipeline, outcome, artifact, and alert mutations.
BACKFILL_ADMIN_TOKEN=

# Optional delivery of validated shadow predictions only. No trade is submitted.
MEMETRACE_ALERTS_ENABLED=false
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
ALERT_PROBABILITY_THRESHOLD=0.80
PUBLIC_APP_URL=http://localhost:3000
```

Never use `NEXT_PUBLIC_` for provider, admin, or delivery secrets.

## App API

| Endpoint | Purpose | Truth boundary |
|---|---|---|
| `GET /api/coins` | Recent real coin feed; filters include `limit`, `cursor`, `source`, `status`, `q`, `minLiquidityUsd`, `minVolume24hUsd`, and `enrich` | Bounded discovery with source coverage and warnings; not all launches |
| `GET /api/coins/{mint}?historyLimit=100` | Exact-mint current enrichment plus bounded recent ledger observations and storage state | Real current/bounded history; missing history remains explicit |
| `GET /api/cohort/red-pump` | Browse the corrected published 860,194-launch cohort and inspect exact import/source status | Launch/social-metadata census plus confirmed fast graduations; `TIMEOUT` stays right-censored and is never a loss label |
| `POST /api/cohort/import` | Admin-protected idempotent manifest, row-batch, and exact-count finalization actions | Frozen dataset identity/hashes/counts; at most 1,000 rows per request; no label reinterpretation |
| `PUT /api/cohort/raw?filename=…` | Verify and privately archive either frozen source file in R2 | Exact filename, byte count, and SHA-256 required; no public raw-file response |
| `POST /api/coins/backfill` | Admin-protected bounded archive scan and optional per-asset history collection | Requires `SOLANA_ARCHIVE_RPC_URL`, `BACKFILL_ADMIN_TOKEN`, and `x-backfill-token`; not an unbounded job runner |
| `GET /api/collection/token` | Report collection-control configuration and the execution method | Status only: no provider request, quota use, or D1 write |
| `POST /api/collection/token` | Collect bounded real provider observations for one exact mint and time window | Requires `BACKFILL_ADMIN_TOKEN`/`x-backfill-token`; at most 31 days, 5 pages/provider, and 4 order sizes; metered providers also require the global cost gate plus their key; no signing/trading |
| `POST /api/pipeline/run` | Run one protected, bounded research-maintenance cycle over discovery, detail/collection, all elapsed clock/cutoff snapshots, validated-only shadow lookup, mature outcomes, candidate training, and optional alerts | At most 10 coins, 3 discovery pages, 2 collection pages, 31 days, 3 quote sizes, 100 outcome snapshots, and 25 alerts; metered use is off by default; no GET execution, scheduler, candidate promotion, transaction submission, or trading |
| `GET /api/coins/{mint}/research` | Point-in-time feature/outcome/model-readiness report, safe current public probes, eligible feature-snapshot persistence, and validated-artifact lookup | Public GET never authorizes metered providers; current Jupiter/Jito rows are timestamped and never backdated; without an exact validated artifact it remains untrained; an eligible served prediction is shadow-only |
| `GET /api/model/research` | Train/evaluate from persisted point-in-time snapshots and matured outcomes | Usually returns **Insufficient data** until a real cohort meets the registered gates |
| `POST /api/model/research` | Validate/train caller-supplied examples, predict from an explicit artifact, or run protected `action=train-persist` | Artifact persistence requires `BACKFILL_ADMIN_TOKEN`/`x-backfill-token`; `validated` status is refused unless calibrated walk-forward serving gates pass |
| `POST /api/model/outcomes/materialize` | Assess at most 100 stored feature snapshots against exact cutoff-aligned execution paths; optional dry run | Protected by `BACKFILL_ADMIN_TOKEN`/`x-backfill-token`; writes only complete matured labels, never false zeroes; it is not a scheduler or path collector |
| `GET /api/alerts` | Report Telegram enabled/configured state, threshold, validated-only policy, and trading-disabled state | Returns no secret values and performs no delivery |
| `POST /api/alerts` | Run a bounded Telegram shadow-alert delivery pass (`limit` `1..25`, optional `dryRun`) | Protected by `BACKFILL_ADMIN_TOKEN`/`x-backfill-token`; selects only threshold-passing shadow predictions joined to matching validated artifacts; deduplicates delivered prediction/channel pairs; submits no trade |
| `GET /api/sources` | Provider definitions, credentials, access policy, coverage, and live health | Connection health is not collection coverage or model validity |
| `GET /api/sources/token?mint={mint}` | Legacy current-source enrichment for one validated mint | Current lookup only, not a historical report |

The exact research-route query parameters and response contract are documented in Data & methods and `docs/10-source-connections-and-changelog.md`.

## Persistence

The Cloudflare D1 schema contains normalized `sources`, `assets`, `observations`, `feature_snapshots`, `outcomes`, `predictions`, `execution_probes`, `experiments`, `model_artifacts`, `alert_deliveries`, `cohort_imports`, and compact `cohort_launches`. The RED-PUMP importer stores verified raw gzip files privately in `RAW_RESEARCH` and only the browseable launch index in D1. Current request paths write assets/observations and eligible feature snapshots; the protected collector uses the same observation persistence path only when it resolves an existing coin row. The protected manual materializer can write a matured outcome only from a complete, exact-aligned `execution_path` already stored in D1; current Jupiter probes are ephemeral `execution_quote` rows, not that path. Protected research actions can persist immutable model artifacts, an exact validated artifact can write a shadow prediction, and the alert runner records one delivery state per prediction/channel. The manual pipeline orchestrates those same bounded writes and always stores trained artifacts as candidates; it adds no new fidelity, scheduler, or serving permission.

Storage never increases source fidelity. Every observation retains its source, event/observation/availability/retrieval time, commitment/canonical state, signature/slot where available, normalized payload, and missing reason.

## Verify

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build
```

`npm test` performs a production build and runs rendered/API/provider/ingestion/model tests. Upstream-facing tests must tolerate an honest outage without turning unavailable data into fixtures.

## Project memory

- [PRODUCT.md](PRODUCT.md): product, research, and truth contract.
- [DESIGN.md](DESIGN.md): three-screen interface and state rules.
- [AGENTS.md](AGENTS.md): implementation, verification, documentation, and safe-push rules.
- [CHANGELOG.md](CHANGELOG.md): user-visible releases and limitations.
- [docs/UI-DECISIONS.md](docs/UI-DECISIONS.md): component intake and performance evidence.
- [docs/10-source-connections-and-changelog.md](docs/10-source-connections-and-changelog.md): exact upstream/app connections and update ledger.
- [docs/11-terminology-appendix.md](docs/11-terminology-appendix.md): beginner terminology.
