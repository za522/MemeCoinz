# Source connections and update ledger

**Last verified:** 28 August 2026  
**Scope:** Solana Pump/PumpSwap research. “Connected” means an interface can return data; it never means complete coverage, a trained model, or a profitable strategy.

## What was implemented

1. **Real coin feed:** bounded Pump and PumpSwap signature scans through Solana JSON-RPC, exact official-instruction decoding, current market enrichment, continuation cursors, and explicit partial-coverage warnings.
2. **Fallback discovery:** optional Solana Tracker latest-token rows and, only when the combined canonical/vendor/stored set is too small, DEX Screener latest paid profiles. If the host returns no rows because its public egress is unavailable, the browser may call DEX Screener's CORS-enabled profile/pair endpoints directly. Both DEX paths are labelled selection-biased; browser-direct rows are read-only and never training data.
3. **Real coin detail:** bounded recent mint transactions plus current supply, largest token accounts, priority-fee samples, DEX market data, Jupiter price, provenance, missing reasons, and conditional D1 persistence.
4. **Advanced per-token collection:** public GET is status-only; authenticated POST runs bounded Helius, Solana Tracker, X, Jupiter quote, and Jito context collectors. Metered branches also require an explicit cost gate and provider key.
5. **Historical path:** an admin-protected, bounded archive backfill route that requires a separate archive RPC and never pretends public live RPC is complete history.
6. **Research engine:** point-in-time features, executable outcome labels, a protected bounded outcome materializer, and a strict supervised pipeline. The materializer writes only complete, mature, cutoff-aligned `execution_path` labels; every other path remains pending/unavailable/invalid/missing.
7. **Manual pipeline runner:** authenticated POST orchestrates one bounded discovery/detail/collection, all elapsed clock/cutoff snapshots, validated-only shadow lookup, mature outcomes, candidate-only training, and optional alert pass. It has no GET execution surface, scheduler, candidate promotion, or transaction submission.
8. **Validated serving and delivery boundary:** protected model-artifact persistence, exact validated-artifact lookup, shadow-prediction persistence, and a disabled-by-default Telegram runner that deduplicates deliveries and cannot trade.
9. **Still absent here:** no installed Helius, Solana Tracker, X, or production Jupiter credential; no complete cohort or validated artifact; alerts are disabled/unconfigured; no scheduled collection or paper/live trading.

## The websites, bluntly

| Name | What it is | How MemeTrace uses it |
|---|---|---|
| **Solana** | The canonical ledger where transactions, balances, slots, and program instructions exist | Primary source for Pump/PumpSwap discovery and bounded per-mint history |
| **Pump.fun / PumpSwap** | The launch protocol, bonding curve, graduation path, and AMM programs | Official program IDs/IDL discriminators are decoded through Solana; consumer pages are not scraped |
| **DEX Screener** | A market-data index/scanner for pools, prices, liquidity, activity, token profiles, and paid promotions | Current market enrichment; latest paid profiles are only a partial fallback, never the full launch denominator; credential-free browser-direct recovery is allowed only when the server feed is empty and is not persisted |
| **Solana Tracker** | A commercial indexed data vendor and terminal | Optional latest-token discovery plus bounded trades, holders/chart, bundler/risk, and deployer-history adapters when the cost gate and key are installed; MemeScope is a product surface, not canonical evidence |
| **Photon MemeScope** | A trading/discovery interface | Manual product reference only; no supported licensed ingestion is configured |
| **Fomo.family** | A consumer discovery/trading interface | Manual product reference only; published restrictions rule out unsupported automation |
| **memescope.net** | A separate site advertising private data/API access | Partnership-only until schema, provenance, service terms, and redistribution rights are verified |
| **Jupiter** | Solana pricing/routing infrastructure | Current Price v3 enrichment plus protected, size-specific USDC→token→USDC quote probes; no order construction or submission |
| **Jito** | Solana block-engine/MEV infrastructure | Current tip-account/tip-floor context only; no token-specific bundle claim, submission, or complete historical bundle archive |
| **X** | Social-post source for narrative/attention evidence | Bounded exact-mint/official-URL/full-name search and count adapters exist, but no bearer token or retained corpus/embeddings exists here |
| **Helius** | Commercial Solana index/archive/stream infrastructure | Bounded `getTransactionsForAddress` history adapter exists, but no credential or collected local Helius corpus exists here |
| **Telegram Bot API** | A message-delivery interface, not a market-data source | Optional delivery of eligible validated shadow predictions; disabled and unconfigured by default; never submits a trade |

The app’s own D1/R2 stores are destinations, not independent sources. Storing a value does not make it canonical.

## Status words

| Status | Exact meaning |
|---|---|
| **Connected** | The implemented adapter returned a schema-valid response at the stated check time. |
| **Partial** | Some real data returned, but the request is bounded, one component failed, or the source cannot represent the full population. |
| **Credential required** | Code exists; the named server secret/entitlement is absent. No request was made. |
| **Configured, unverified** | A secret exists but a successful schema-valid call has not been evidenced. |
| **Manual/reference only** | Useful for human comparison, not automated ingestion. |
| **Disabled by policy** | No supported/licensed collection path is approved. |
| **Insufficient data** | The calculation exists, but the real examples/classes/coverage do not satisfy the registered research gate. |

Always show checked time, exact source, coverage window or scan bound, and a missing/error reason. A healthy endpoint is not continuous ingestion.

## App API contract

### `GET /api/coins`

Returns a recent real feed.

| Query | Values | Meaning |
|---|---|---|
| `limit` | `1..100` (default `30`) | Maximum returned rows |
| `cursor` | Cursor returned by this API | Continues bounded discovery; malformed cursors return `400 invalid_cursor` |
| `source` | `auto`, `rpc`, `tracker` | `auto` combines permitted sources; `rpc` excludes vendor discovery; `tracker` requires its key |
| `status` | `all`, `bonding`, `graduated` | Lifecycle filter; graduated also accepts a known pool stage |
| `q` | Up to 100 characters | Server-side exact-mint/name/ticker substring filter; ticker is not identity proof |
| `minLiquidityUsd`, `minVolume24hUsd` | Non-negative number | Current-market filters; missing does not pass |
| `enrich` | `true`/`false` | Whether to request current DEX/Jupiter market fields |

Response shape:

```text
generatedAt
coins[]
  mint, name, symbol, imageUri, metadataUri, creator
  createdAt, createdSlot, creationSignature, canonicalConfirmed
  lifecycle { venue, stage, graduatedAt, poolAddress }
  market { priceUsd, marketCapUsd, liquidityUsd, volume24hUsd,
           buys24h, sells24h, priceChange24hPct, pairAddress,
           dexId, pairCreatedAt, observedAt }
  provenance[] { sourceId, role, fidelity, eventAt, observedAt,
                 availableAt, retrievedAt, signature?, slot?, missingReason? }
  missing[] { field, reason, sourceId? }
pagination { limit, nextCursor, hasMore }
ingestion { requestedSource, discoverySources[], coverage[], storage, warnings[] }
```

`coverage[]` exposes signatures scanned, transactions requested/decoded, exact creates/migrations found, newest/oldest event time, partial state, error code, and missing reason. Header: `X-Research-Data: real-live-and-stored-observations`.

If this server response contains zero coins, the client may make two credential-free CORS requests to DEX Screener (`/token-profiles/latest/v1` and `/tokens/v1/solana/{mints}`). Any recovered rows explicitly replace the response coverage with a browser-direct, promoted-subset warning and `storage.state = read-only`; no browser row becomes a canonical launch, persisted observation, or model example.

### `GET /api/coins/{mint}?historyLimit=100`

Validates one base58 Solana address, collects at most `1..200` recent mint signatures, merges stored and live observations, enriches the current market, and conditionally writes D1.

Response:

```text
generatedAt
coin { same identity/lifecycle/market/provenance/missing fields as the feed }
observations[]
  id, mint, sourceId, observationType
  eventAt, observedAt, availableAt, retrievedAt
  slot, transactionIndex, instructionIndex, commitment, canonicalStatus
  fidelity, signature, normalized, nullReason
historyCoverage
  signaturesScanned, transactionsDecoded, oldestEventAt,
  newestEventAt, partial, missingReasons[]
storage { state, reason, assetsWritten?, observationsWritten? }
warning
```

Recent chain transactions preserve decoded instruction kinds, owner token-balance deltas, parsed token transfers, native balance changes, fee payer, transaction fee, compute units, and success state. Exact transaction order inside a slot is unavailable from `getTransaction`; `getBlock` would be required. Header: `X-Research-Data: real-current-and-bounded-ledger-history`.

### `POST /api/coins/backfill`

Requires both server variables `SOLANA_ARCHIVE_RPC_URL` and `BACKFILL_ADMIN_TOKEN`, plus request header `x-backfill-token`. The token comparison is constant-time.

Accepted JSON fields: `before`, `until`, `maxPages` (`1..20`), `signaturesPerPage` (`20..500`), `maxAssets` (`1..1000`), `historyPerAsset` (`0..200`), `maxHistoryAssets` (`0..25`), and `dryRun`.

Returns the exact bounded request, discoveries, next cursor, per-program coverage, storage result, and warnings. It is deliberately not an unbounded background job.

### `GET` / `POST /api/collection/token`

`GET` is a status-only control response (`memetrace-token-collection-control/v1`). It reports whether admin execution is configured and that POST is required. It makes no upstream request, consumes no provider quota, and writes nothing.

Authenticated `POST` requires `BACKFILL_ADMIN_TOKEN` plus `x-backfill-token`. Its JSON body accepts one exact `mint`; optional ISO `from`/`to` (default one hour, maximum 31 days); `maxPages` (`1..5`); `orderSizesUsd` (one to four values from $1 to $10,000); `slippageBps` (`1..1000`); optional `fullName` and up to four HTTPS `officialUrls`; and `persist` (default true). Provider failures are isolated rather than replaced with fixtures.

The response `memetrace-token-collection/v1` reports the requested window, scraping/trading/submission policy, per-provider configured/state/items/pages/truncation/error/caveats, normalized `coinObservations[]`, persistence state, and warnings. Helius, Solana Tracker, X, and keyed Jupiter calls require all three gates: this authenticated execution path, `TOKEN_ENRICHMENT_METERED_ENABLED=true`, and the provider credential. Jupiter public-lite quotes and Jito read-only context do not use metered credentials. Observations persist through the existing D1 path only if an asset row is resolved; otherwise the response is explicitly read-only. No adapter builds, signs, or submits a transaction.

### `GET /api/coins/{mint}/research`

Point-in-time report query:

| Query | Allowed/default | Meaning |
|---|---|---|
| `referenceClock` | `launch` or `graduation`; default `launch` | Event that starts the decision timer |
| `cutoffSeconds` | `30`, `60`, `300`, `900`, `3600`; default `300` | Point-in-time evidence boundary |
| `orderSizeUsd` | Positive number; default `100` | Position size for the executable outcome definition |
| `horizonSeconds` | Positive integer; default `86400` | Time allowed for the outcome path to mature |

Malformed mint/query values return `400`. Missing history, reference events, providers, or features return an honest HTTP `200` `pending`/`insufficient_data` response rather than a synthetic fallback. Headers include `X-Research-Data: real-point-in-time-only` and `X-Automatic-Trading: disabled`.

Each public report also attempts one safe current-only collection pass. `evidence.collection` reports `mode: safe-current-only`, `attempted: true`, `meteredProvidersAllowed: false`, per-provider state/configuration/item/error summaries, persistence, and warnings. Helius, Tracker, X, and keyed Jupiter are never authorized from this GET even if their secrets exist; public-lite Jupiter and Jito may return current timestamped observations. Those current rows can be stored but are never backdated into an earlier decision cutoff.

The response schema is `memetrace-coin-research/v1` and contains:

- coin identity;
- reference clock/time, reference availability/canonical state, cutoff, decision/evaluation time, and the leakage rule;
- observed/engineered feature families and model-ready timestamped values, or `null` when a reference row cannot be built;
- mapping audit (included/excluded/unmapped observations);
- history/source coverage, D1 storage state, point-in-time feature-snapshot storage state, and missing prerequisites;
- executable outcome state (`pending`, `unavailable`, or persisted/matured);
- prediction state. With no exact matching validated artifact it is `untrained`; otherwise the validated artifact may score the eligible row and the result is persisted in `shadow` mode. No probability is fabricated from an absent artifact.

The current feature contract is `memetrace-point-in-time/v2:{launch|graduation}`. Its deterministic snapshot identity is `feature:{mint}:{clock}:{cutoffSeconds}:v2`, so launch/graduation and cutoff rows cannot collide.

Provider-derived coordination fields—bundler wallet count, bundled/initial-bundled supply shares, current risk score, insider/sniper shares, and rugged flag—are exposed only as separate `indexed*` proxy features. They never alter the canonical coordination/wash evidence indices. X aggregate exact-identity count/rate/velocity fields are likewise kept separate from enumerated-post metrics.

For an elapsed, leakage-audited row, `evidence.featureStorage` reports `written`, `read-only`, `unavailable`, or `failed`, plus the reason and whether a snapshot was written. The stored `featureJson` contains `referenceClock`, `referenceAt`, `decisionAt`, and per-feature values with event/availability time, family, taxonomy, fidelity, and missing reason. Pending/future or misaligned rows are never written, and a D1 failure remains a nonfatal HTTP `200` caveat.

A persisted outcome aligns first by its explicit `featureSnapshotId`, `referenceClock`, `cutoffSeconds`, and `decisionAt`. Legacy evidence-field matching is used only when an older outcome has no snapshot ID. This prevents a matured label from being attached to the wrong clock or cutoff.

### `GET /api/model/research`

Loads only persisted feature snapshots with per-feature event/availability timestamps and cutoff-aligned matured outcomes. Optional filters: `target`, `featureSetVersion`, positive `horizonSeconds`, and positive `orderSizeUsd`.

The default training gate requires at least 200 examples, 120 unique tokens, 25 positives, 50 negatives, 60 training tokens, and 15 test tokens. If D1 is unavailable, the endpoint returns `503` and `status: insufficient-data`; if D1 exists but the cohort is too small, it returns an `insufficient-data` result with counts and audit. No demo rows are injected.

### `POST /api/model/research`

`action=train` audits/trains explicit point-in-time examples and `action=predict` scores one explicit compatible example/artifact. Protected `action=train-persist` loads the persisted cohort, applies the same insufficiency gate, and stores an immutable candidate or validated artifact in D1. It requires `BACKFILL_ADMIN_TOKEN` in the server environment and `x-backfill-token` on the request. `validated` status is refused unless the artifact contains calibrated chronological walk-forward evidence and meets its registered sample/token gates.

### `POST /api/model/outcomes/materialize`

Protected by `BACKFILL_ADMIN_TOKEN` plus `x-backfill-token`, this route assesses at most `1..100` persisted feature snapshots for a positive horizon/order size (defaults: 50 snapshots, 24 hours, $100). Optional `dryRun: true` writes nothing. The response states `labelAsOf` and `maturedDecisionThrough`; only snapshots whose decision time is at least one full horizon old are scanned. A label is written only when an existing `execution_path` observation matches the exact feature snapshot, clock, cutoff, decision time, and order size; has a usable entry; and supplies complete mature exit coverage. Pending, partial, unavailable, malformed, misaligned, orphaned, and missing paths never become zero labels. This is a manual bounded materializer, not an execution-path collector or scheduler.

### `GET` / `POST /api/alerts`

`GET` returns only operational state: enabled, Telegram configured, probability threshold, policy `validated-shadow-predictions-only`, and `tradingEnabled: false`. It never returns credentials.

Protected `POST` runs one bounded pass (`limit` `1..25`, default `10`; optional `dryRun: true`). It requires the same server/admin header pair as backfill. The runner selects only persisted predictions whose mode is `shadow`, probability meets `ALERT_PROBABILITY_THRESHOLD`, and model version joins to an artifact with status `validated`. Successful prediction/channel pairs are deduplicated in `alert_deliveries`. `MEMETRACE_ALERTS_ENABLED` defaults to `false`; `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are required for real delivery, and `PUBLIC_APP_URL` only builds the report link. The route sends a research message through Telegram's official Bot API and never submits a transaction. No background scheduler is included.

### `POST /api/pipeline/run`

This is the protected, POST-only entry point for one bounded research-maintenance pass. It requires `BACKFILL_ADMIN_TOKEN` plus `x-backfill-token`; there is no GET execution surface. It can discover selected coins, load each detail once, optionally collect advanced evidence, compute and conditionally persist every elapsed launch/graduation × `30/60/300/900/3600` feature snapshot, look up exact matching validated artifacts and persist eligible shadow predictions, materialize mature outcomes, train and persist launch/graduation candidates, and optionally invoke the Telegram runner.

Accepted options and hard limits:

| Field | Default / limit | Meaning |
|---|---|---|
| `maxCoins` | `5`; `1..10` | Maximum selected coins |
| `maxDiscoveryPages` | `1`; `1..3` | Maximum bounded discovery pages |
| `discoverySource` | `auto`; `auto`/`rpc`/`tracker` | Discovery policy |
| `historyLimit` | `200`; `1..200` | Recent transactions per selected mint |
| `collectAdvanced` | `true` | Whether to run the advanced per-token collector |
| `allowMetered` | `false` | Requests credentialed calls; those calls still require the global cost gate and each provider key |
| `collectionMaxPages` | `1`; `1..2` | Per-provider collection pages |
| `collectionWindowHours` | `24`; `1..744` | Collection window, capped at 31 days |
| `orderSizesUsd` | `[25,100,500]`; 1–3 unique values, each `$1..$10,000` | Current quote-probe sizes |
| `slippageBps` | `100`; `1..1000` | Quote slippage setting |
| `horizonSeconds` | `86400`; `1..2,678,400` | Outcome horizon, at most 31 days |
| `orderSizeUsd` | `100`; `$1..$10,000` | Registered outcome/model size |
| `maxOutcomeSnapshots` | `50`; `1..100` | Matured-outcome scan bound |
| `runTelegramAlerts` | `false` | Whether to call the alert runner after research/model work |
| `telegramDryRun` | `true` | Default alert behavior even when alert invocation is requested |
| `telegramLimit` | `10`; `1..25` | Maximum alert candidates considered |
| `evaluatedAt` | request time; never future | Reproducible evaluation boundary |

The `memetrace-research-pipeline/v1` response reports discovery pages/storage, selected/detail/canonical coin counts, provider collection states and item/write counts, snapshot counts by clock/cutoff, validated-shadow serving/write states, mature-outcome categories, per-clock candidate-training state, optional alert result, warnings, and explicit safety fields. Training status is hard-coded to candidate: this runner can never validate or promote an artifact. `automaticTrading`, `transactionSubmission`, `candidateAutoPromotion`, and `schedulerInstalled` are always `false`. A run can be `partial` because evidence or storage is missing; that is not silently upgraded to success or model readiness.

### Other routes

| Endpoint | Current use |
|---|---|
| `GET /api/sources` | Registry, credentials, rights, historical category, and safe live health checks |
| `GET /api/sources/token?mint={mint}` | Legacy current enrichment boundary; not historical |

No API submits a transaction.

## Upstream connection ledger

| Source | Exact interface used now | Current status in this environment | Data obtained | Boundary |
|---|---|---|---|---|
| [Solana JSON-RPC](https://solana.com/docs/rpc) | `getSignaturesForAddress`, batched `getTransaction` (`jsonParsed`, confirmed), `getTokenSupply`, `getTokenLargestAccounts`, `getRecentPrioritizationFees`; optional separate archive URL | Public live endpoint available for light requests; archive endpoint absent | Canonical program/mint transactions, slots/block times, balances/transfers, fee payer/fees, supply, largest token accounts, recent fee samples | Public RPC is rate-limited and not archive-complete; largest accounts are token accounts, not resolved owners |
| [Pump official public IDLs](https://github.com/pump-fun/pump-public-docs/tree/main/idl) | Pump program `6EF8…F6P`, PumpSwap `pAMM…XEA`; exact 8-byte `create`, `createV2`, `migrate`, `createPool` discriminators | Decoder implemented | Launch/graduation/pool candidates, mint, creator, metadata fields when decodable, signature, slot, block time | Only exact matches count; IDL/version changes require review |
| [DEX Screener API](https://docs.dexscreener.com/api/reference) | `/token-profiles/latest/v1`, `/tokens/v1/solana/{mints}`, `/token-pairs/v1/solana/{mint}`, `/orders/v1/solana/{mint}` | Keyless public adapter implemented | Paid token profiles; current pair, price, liquidity, market cap/FDV, volume, price change, buys/sells, age, boosts, links/socials, paid orders | Profiles are partial/paid/biased; current rolling values are not historical launch-window observations; review display/redistribution terms |
| [Jupiter](https://dev.jup.ag/docs) | `/price/v3?ids={mints}`; protected collector uses read-only `/swap/v1/quote` on public-lite or gated keyed host for USDC→token→USDC | Public price/quote adapters implemented; production key absent | Current price plus route availability, amounts, price impact, latency, route plan, and round-trip retention at up to four sizes | Ephemeral current quotes; no signing/submission, guaranteed fill, historical quote, or full outcome path |
| [Solana Tracker Data API](https://docs.solanatracker.io) | `/tokens/latest`, `/tokens/{mint}`, `/price`, `/trades/{mint}`, `/tokens/{mint}/holders/paginated`, `/holders/chart/{mint}`, `/tokens/{mint}/bundlers`, `/deployer/{wallet}` | Adapters implemented; `SOLANA_TRACKER_API_KEY` absent | With cost gate/key: indexed identity/markets, bounded trades, current holders/risk/bundlers, historical holder-count chart, and deployer-attributed tokens | Vendor trade availability remains retrieval-time; current labels can change; beneficial ownership/coordination is not proven; review rights |
| [Helius](https://www.helius.dev/docs) | DAS `getAsset`; bounded JSON-RPC `getTransactionsForAddress` with full parsed transaction detail and time filters | Adapters implemented; `HELIUS_API_KEY` absent | With cost gate/key: indexed metadata plus up to five pages/500 address transactions, balances, token-owner deltas, fee payer/fees, slot/index | Block-time + 2s availability is an explicit reconstruction, not observed latency; historical USD stays null; no local Helius coverage claimed |
| [X API](https://docs.x.com/x-api/posts/counts/introduction) | `/2/tweets/search/recent|all` and `/2/tweets/counts/recent|all` with bounded pagination and exact mint/URL/full-name query classes | Adapters implemented; `X_BEARER_TOKEN` absent | With cost gate/key/plan: post text/author identity class, minute count buckets, and mutable current public metrics kept separately | Ticker-only matching excluded; archive event time is historical but availability is retrieval-time; engagement/followers are not backdated; posts are manipulable; review X use/retention rules |
| [Jito](https://docs.jito.wtf/lowlatencytxnsend/) | Read-only `getTipAccounts` plus `bundles.jito.wtf/api/v1/bundles/tip_floor` | Public read-only adapters implemented | Current network-wide tip accounts and percentile floor context | No submission, token-specific bundle membership, or complete historical bundle archive; clues never prove common control |
| [Telegram Bot API](https://core.telegram.org/bots/api#sendmessage) | `POST /bot{token}/sendMessage`, invoked only by the protected alert runner | Disabled; bot/chat credentials absent | Eligible validated shadow-prediction message, exact mint, cutoff/clock, target, probability/interval when available, and report link | Delivery channel only, not research evidence; no scheduler and no trading |
| Pump.fun consumer pages | None | Manual only | Human product reference | Do not scrape; chain programs are the data source |
| [Fomo.family](https://fomo.family/terms) | None | Disabled by policy | Human product reference | No automation without a supported interface and written rights |
| Photon MemeScope | None | Disabled by policy | Human product reference | Do not scrape or reverse-engineer private endpoints |
| [memescope.net](https://memescope.net/) | None | Partnership only | None | Require documented schema, provenance, SLA, retention, and redistribution rights |

## What each source contributes to research

| Research family | Implemented inputs (credentialed where stated) | Important missing inputs |
|---|---|---|
| Lifecycle and flow | Launch/pool time, decoded transactions, optional bounded Helius history and Tracker trades, current DEX counts/volume | Complete canonically reconciled USD-normalized buy/sell stream from each reference time |
| Liquidity and execution | Current pool liquidity/price plus current Jupiter size-specific buy/sell quote pairs | Prospectively sampled quotes/routes/failures at every cutoff and through the full outcome horizon; landing/signing risk |
| Ownership and creator | Creator/largest token accounts plus optional Tracker current holders, holder-count series, risk/deployer history | Token-account-to-beneficial-owner resolution, exact historical owner balances at cutoffs, creator sales/fees |
| Coordination and wash clues | Slots/signatures/fees/balance deltas plus optional Tracker bundler/risk labels and current Jito tip context | Exact slot order, classified funding graph, exchange/bot exclusions, recurring cohorts, synchronized exits, token-specific bundle IDs |
| Narrative and paid attention | DEX links/paid status plus optional X exact-mint/official-URL/full-name posts and counts | Prospectively known availability, embeddings/clusters, credibility/manipulation estimates, permitted durable corpus |
| Market regime | Current/recent priority-fee samples, SOL/current price primitives, current Jito tip floor | Versioned SOL return/volatility, congestion, launch rate, and market-wide liquidity at every cutoff |
| Evidence quality | Provenance, event/observed/available/retrieved times, fidelity, scan bounds, missing reasons | Prospectively captured historical arrival/latency for data reconstructed from old blocks |

The engine calculates every family it can, immediately, but it does not invent missing inputs. “Code exists” and “a feature has real coverage” are separate facts.

## Corrected RED-PUMP launch cohort

The app can import [RED-PUMP-2026-v1 v1.4](https://zenodo.org/records/21923106), a CC-BY-4.0 published corpus covering 860,194 unique Pump launches observed from 8 May to 10 June 2026. The protected importer verifies the two frozen gzip files against their published byte counts and SHA-256 values, archives them privately in R2, writes a compact browseable launch index to D1, and marks the import ready only when all four expected counts match exactly.

This is real historical data, but it is not the final supervised-learning cohort. The publisher repeatedly polled a rolling top-50 endpoint, giving a median visibility window of about 2.77 minutes. Its 1,651 `GRADUATED` rows are confirmed fast-regime events. Its 831,290 `TIMEOUT` rows are right-censored after visibility loss and are never converted into failures or negative profit labels. Another 27,253 launches have no published outcome row. The corpus contains launch metadata/social-presence flags, not full transaction paths, wallet graphs, historical X text, size-specific route histories, or executable returns.

### Calculated historical layer

`scripts/materialize_cohort_features.py` processes all 860,194 launches in chronological batches. For every launch it stores a versioned metadata/narrative theme, matching terms and confidence, metadata completeness, social-link count, exact name/symbol reuse over the preceding 24 hours, total and theme-specific launch rates, narrative novelty, copy pressure, and observation lag. Every rolling value uses only rows with a strictly earlier observation timestamp; simultaneous rows do not see one another.

The same job writes 60 descriptive association rows across narrative theme, social-link count, metadata completeness, novelty, copy pressure, reuse, launch rate, and observation lag. The displayed rate is `confirmed fast graduations / all launches in the feature band`. Because timeout and missing outcomes remain in that denominator, this is a conservative lower-bound association, not a failure rate, causal effect, feature importance, executable-return estimate, or model validation result.

### Free direct collector

`npm run collect:free -- --mode both --watch` runs a credential-free operator collector. It queries the configured public Solana RPC for official Pump program signatures, fetches transactions sequentially within published public limits, accepts only exact supported instruction discriminators, enriches confirmed mints through public DEX Screener and Jupiter reads, optionally requests bounded mint history, and posts at most 100 coins / 5,000 observations / 5 MB to protected `POST /api/coins/ingest`. Archive continuation is checkpointed under `.research/`; metered providers, alerts, wallet signing, and transaction submission are absent.

At the 28 August 2026 verification checkpoint, free local runs had persisted two canonical launches and 51 real observations: two launch records, six DEX market snapshots, six Jupiter price snapshots, and 37 size-specific Jupiter execution quotes. The point-in-time pipeline had materialized nine elapsed launch snapshots. The watcher continues to append evidence after that checkpoint. This proves the free path functions end to end. It does not prove historical completeness, continuous hosted operation, profitable labels, or an edge. Public Solana RPC has no archive-completeness or production SLA, and the watcher stops when its operator process stops.

The protected cohort import accepts launch rows, calculated feature rows, and precomputed aggregate association rows as separate idempotent actions. `scripts/upload_red_pump.py` handles the verified launch/outcome corpus and immutable raw files; `scripts/upload_cohort_research.py` transfers the calculated feature and aggregate tables without putting the 860,194-row dataset into application source.

## Historical data: what is and is not recoverable

- Chain events, block time, token balances, transfers, fees, and signatures can often be backfilled if an archive RPC retains them.
- The app’s archive path marks those rows **reconstructed**. When actual arrival was not captured, it currently uses block time plus a documented two-second confirmation assumption for `availableAt`; real historical RPC/vendor latency may have been longer.
- Historical X posts/counts and Solana Tracker series retain their historical `eventAt`, but their original provider indexing/arrival time was not archived. The collector therefore uses retrieval time for `availableAt`, preventing a fresh archive query from leaking into an old decision cutoff.
- Old DEX ranks, historical route responses/failures, deleted or edited social content, X delivery time, paid promotion state, provider outages, and vendor label versions cannot be reconstructed reliably unless the provider supplies a licensed archive.
- Therefore, backfill and prospective capture are both required. Backfill can create training examples for recoverable fields; live collection is needed to measure irrecoverable timing and execution conditions.

## Research and model truth

- One example is exact mint × reference clock (`launch`/`graduation`) × cutoff.
- A record is eligible only if `eventAt <= decisionAt` and `availableAt <= decisionAt`.
- Model output is forbidden as a model input. Tokens are grouped so one token cannot straddle train and test.
- Training labels must have matured before a test period begins.
- The default executable target is versioned by label name, horizon, and order size; chart-price peaks are not substituted for executable exits.
- Reported research metrics include calibration/Brier, PR-AUC, precision-at-k, net return/EV, strategy drawdown, feature relationships, and family ablations.
- Candidate/validated artifacts are immutable and versioned. Only artifacts that pass the registered serving gates may receive `validated` status; only exact validated matches may produce persisted shadow predictions.
- **Current model state: untrained/insufficient.** The software pipeline and serving/alert boundaries are real; a validated edge, eligible prediction, or delivered alert is not.

## Storage contract

| Store | Purpose | Current truth |
|---|---|---|
| D1 | Queryable sources, assets, observations, feature snapshots, outcomes, predictions, execution probes, experiments, model artifacts, and alert deliveries | Current routes write assets/observations and eligible feature snapshots; the protected manual materializer can write only complete mature labels from existing exact-aligned `execution_path` rows; model artifacts/shadow predictions and alert deliveries are conditional |
| R2 | Immutable raw upstream payloads referenced by D1 hash/key | Binding is declared; current feed/detail paths do not populate it |

Every persisted observation keeps source, type, `eventAt`, `observedAt`, `availableAt`, `retrievedAt`, slot/order/instruction where available, signature, commitment/canonical state, fidelity, normalized payload, and null reason. Secrets are never stored in evidence rows or returned to the browser.

## Required next data work

1. Continue the free checkpointed public-RPC backfill, reconcile create/migrate counts page by page, and publish coverage by time range. Add a licensed archive RPC only when public retention/rate limits create measured gaps.
2. Operate the free watcher prospectively and add durable hosted scheduling so actual arrival time, failures, provider health, and source disagreement survive terminal restarts.
3. Configure licensed Helius, Tracker, and X access only after quota/retention/redistribution review; reconcile indexed events against canonical chain facts.
4. Add owner resolution, classified funders, exact slot order, recurring cohort/synchronized-exit features, and false-link exclusions for exchanges/popular bots.
5. Schedule current Jupiter quote pairs at registered cutoffs/outcome samples and licensed X identity-matched capture prospectively; then add narrative embeddings and manipulation/authenticity features.
6. Build and schedule complete prospective execution-path collection, materialize leakage-audited feature snapshots and matured executable labels, then train and publish chronological results only after the minimum gates pass.
7. Only then validate an immutable artifact and operate the disabled-by-default alert runner under reviewed credentials, threshold, scheduler, and delivery policy. Keep alerts informational and automatic trading disabled.

## Terminology quick appendix

| Term | Plain-English meaning |
|---|---|
| **Mint** | The unique Solana address that identifies a token. Names and tickers can be copied; the mint is the identity key. |
| **Launch** | The supported Pump create event used as time zero. |
| **Graduation** | The supported migrate/pool event used as an alternative time zero after a bonding curve completes. |
| **Reference clock** | Which event—launch or graduation—starts the cutoff timer. |
| **Cutoff** | How long after the reference event the app pretends to make a decision. |
| **Event time** | When the underlying event happened. |
| **Available time** | When the app could first have used the record. It prevents future leakage. |
| **Point-in-time feature** | A calculation using only records available by one cutoff. |
| **Raw/observed input** | A source fact such as a transaction, balance, or timestamp. |
| **Engineered feature** | A repeatable formula built from raw inputs, such as flow imbalance or owner concentration. |
| **Outcome label** | What later happened under an exact horizon, order size, and cost definition. It is hindsight, not a feature. |
| **Executable return** | Estimated entry/exit result after liquidity, impact, fees, failures, and order size—not the chart’s best price. |
| **Execution quote / path** | A quote is one short-lived size-specific route estimate; a path is an entry plus covered exit samples through the full horizon. The collector currently creates quotes, not complete paths. |
| **Metered provider gate** | Explicit request authorization plus a server cost switch and provider key required before a quota-consuming API call. |
| **Pipeline runner** | One protected, bounded maintenance pass across collection/research/model/alert steps. It is not continuous until an external scheduler deliberately invokes it. |
| **Walk-forward validation** | Train on earlier tokens and test on later ones, repeatedly, without mixing future evidence backward. |
| **Calibration** | Whether events predicted at about 30% actually occur about 30% of the time. |
| **PR-AUC** | Ranking quality for rare winners; generally more informative than accuracy when most launches fail. |
| **Brier score** | Average squared error of probabilities; lower is better. |
| **Cohort** | Every eligible launch in a stated time/source window, including failures—not a winner-only sample. |
| **Cabal/coordination clue** | A statistical wallet relationship that may indicate coordination but does not prove identity, intent, or wrongdoing. |
| **Atomic bundle** | Multiple transactions delivered together for ordered inclusion. Historical bundle membership needs exact evidence; adjacency is only a clue. |
| **Validated model artifact** | An immutable trained model admitted for serving only after the registered chronological and calibration gates pass. It is not proof of future profit. |
| **Shadow alert** | A notification about a recorded validated-model prediction. It sends no order and grants no trading authorization. |
| **Fidelity** | How directly a value reflects canonical evidence: exact, reconstructed, indexed/proxy, or unavailable. |
| **Missingness** | A required value was not observed. It is kept explicit rather than converted to zero. |

The full beginner appendix remains in [11-terminology-appendix.md](11-terminology-appendix.md).

## Related documentation

- [Data sources and site audit](03-data-sources-and-sites.md)
- [Metrics and data dictionary](05-metrics-and-data-dictionary.md)
- [Technical architecture](08-technical-architecture.md)
- [Historical source contract](09-historical-source-contract.md)
- [Terminology appendix](11-terminology-appendix.md)
