---
name: "MemeTrace"
description: "A research interface for finding a memecoin, inspecting what was knowable at a chosen time, and auditing the evidence behind every claim."
register: "product"
updated: "2026-08-28"
---

# Product

## Purpose

MemeTrace helps beginners, quantitative traders, and researchers investigate fast-moving memecoins without trusting a leaderboard or one opaque score. The first controlled market is Pump.fun on Solana; success means a user can find a coin, understand what the evidence does and does not support at a chosen cutoff, and trace every important term and source.

MemeTrace is a research product. It is not an automatic trader, a profitability promise, or a substitute for financial, legal, or compliance advice.

## People

- Primary user: a curious but non-expert memecoin researcher who wants a disciplined starting point.
- Secondary users: quantitatively minded traders and analysts who need point-in-time evidence, denominators, and reproducible definitions.
- Starting knowledge: mixed. Every necessary specialist term must link to a short plain-English definition.
- Setting: deliberate desktop research first, with tablet and phone support for checking a coin or source state. The visual environment is daylight or ordinary room light, not a dark trading terminal.
- Accessibility: WCAG 2.2 AA target, visible focus, keyboard and touch operation, reduced motion, and no status communicated by colour alone.

## Core jobs

1. Check current evidence for an exact Solana address, or intentionally open the labelled demonstration. Historical search is not available yet.
2. Understand one coin at a selected decision cutoff without mixing opportunity, integrity risk, tradability, and evidence quality.
3. Audit the sources, coverage, research method, validation state, release history, and terminology.

## Screen map

MemeTrace has exactly three top-level screens. Feature pillars are details inside a coin report, not separate product screens.

| Screen | One primary task | Content that leads | Success |
|---|---|---|---|
| **Coins** | Find a coin | Mint search, real source result, honest empty/error state, and one clearly labelled demo entry | The user selects real current evidence or knowingly chooses the synthetic demonstration |
| **Coin report** | Understand one coin at a cutoff | Identity, data mode, cutoff/as-of time, four separate assessments, and concise evidence summary | The user can explain what is known, uncertain, unavailable, and worth opening in detail |
| **Data & methods** | Audit the research | Source connections and rights, coverage, method, validation state, release notes, and searchable glossary | The user can trace a claim, understand a term, and see what has not been built or validated |

Do not restore the old Research Lab, Data Coverage, or Live Shadow navigation. Prospective collection may later be documented as a data state; it is not a fourth screen or a user-facing mode.

## Screen contracts

### Coins

- Accept one base58 Solana address, then report whether returned provider evidence confirms it as a token mint. Do not query by ticker alone.
- Submit explicitly; do not spend metered quota while the user types.
- Show loading, malformed-address, unconfirmed-token, no-pair, source-error, and partial-provider states in plain language.
- A real lookup shows only current point-in-time source evidence that actually returned.
- Keep the synthetic fixture as a separate entry labelled **Demo data**. It must never look like a live market result.
- No winner-only feed, trending carousel, or implied recommendation.

### Coin report

- Lead with token identity, exact mint, **Live current lookup** or **Synthetic demo** label, selected cutoff, and as-of time.
- Keep four outputs separate: **Opportunity**, **Integrity risk**, **Tradability**, and **Evidence quality**.
- “Tradability” is the beginner-facing name for executability: whether the stated size could plausibly enter and exit after liquidity, price impact, latency, fees, and failures.
- For the synthetic demo, allow the registered `30s`, `1m`, `5m`, `15m`, and `1h` cutoffs and keep the unvalidated-fixture warning visible.
- For a real current lookup, do not invent historical cutoffs or model scores. Show current evidence and mark historical/model-dependent outputs unavailable until point-in-time ingestion exists.
- Default to a short interpretation and the facts that change it. Put formula components, wallet evidence, narrative detail, execution assumptions, provenance, and caveats behind accessible disclosures.
- Coordination evidence is probabilistic. Never label identity, intent, guilt, or a “cabal” as proven.

### Data & methods

- Combine source registry, connection health, current coverage, source rights, methodology, validation protocol, release notes, and terminology in one auditable reading screen.
- State the exact upstream interface, credential, time coverage, limitation, and commercial-use boundary for each provider.
- Keep glossary search and category filtering local and immediate.
- Explain `available_at`, fidelity, missingness, labels, walk-forward validation, costs, and false-positive controls in beginner language.
- Release notes say what changed and what remains unavailable. Connection health never implies a profitable or complete dataset.

## Inputs and data

- User inputs: exact Solana mint, demo selection, report cutoff, details disclosures, glossary search, and glossary category.
- Repository data: one synthetic replay fixture; versioned research calculations; provider definitions; release notes; glossary; D1 schema; and R2 binding contract.
- Live public data: Solana RPC health/slot and current token supply; current DEX Screener token pairs and paid orders; Jupiter Price v3; Jito read-only endpoint health.
- Optional credentialed data: Helius DAS `getAsset`, Solana Tracker current token overview, and X recent exact-mint counts. Each requires its server secret; the metered token route also requires `TOKEN_ENRICHMENT_METERED_ENABLED=true`.
- Manual or restricted references: Pump.fun consumer pages, Fomo.family, Photon MemeScope, and memescope.net are not scraped. Their exact policy is recorded in Data & methods.
- Stored user data: none. There are no accounts, portfolios, wallets, orders, or personal histories.
- Persisted provider data: none in the current release. D1/R2 schemas and bindings exist, but current lookups are not yet an ingested research dataset.
- Unknown or unavailable: complete Pump/PumpSwap event history, historical cohort, historical route quotes, old proprietary ranks, unaudited social engagement snapshots, trained model performance, prospective shadow results, and live trading.

Never describe fixture, current lookup, configured storage, or an adapter health check as an ingested historical cohort.

## Current release: 0.3.0

### Available

- A three-screen product contract: Coins, Coin report, and Data & methods.
- Exact-address current lookup through server-only provider adapters, with token confirmation reported separately from base58 shape.
- Public health adapters for Solana RPC, DEX Screener, Jupiter Price v3, and Jito read-only evidence. They were manually smoke-tested during development; automated tests verify contracts and tolerate upstream outages.
- Credential-gated Helius, Solana Tracker, and X adapters with secrets kept server-side.
- A clearly labelled synthetic point-in-time demonstration across all research pillars.
- Separate opportunity, integrity-risk, tradability, and evidence-quality explanations.
- Source ledger, methodology, release notes, and beginner terminology.

### Not available

- No ingested historical Pump.fun cohort.
- No running Pump/PumpSwap decoder, archive backfill, or continuous launch collector.
- No provider-response persistence into D1/R2.
- No authenticated Helius, Solana Tracker, or X feed in the current deployment.
- No trained or validated forecast and no demonstrated trading edge.
- No paper portfolio, prospective shadow predictions, wallet execution, or automatic trading.

## Later

- Ingest a contiguous, outcome-independent Pump.fun cohort after the versioned decoder, archive provider, reconciliation checks, and D1/R2 write path are complete.
- Capture prospective social, quote, latency, failure, bundle, and source-health observations that history cannot recreate.
- Train and walk-forward validate outcomes only after point-in-time coverage and executable-return labels pass audit.
- Consider paper trading only after calibrated out-of-sample evidence exists.
- Consider constrained execution only after paper evidence, operational controls, jurisdiction review, provider terms, and explicit user authorization all pass.

## Non-goals

- A casino terminal, urgency feed, or one-tap trading interface.
- A single Buy Score that hides conflicting evidence.
- A winner-only leaderboard or performance claim without the full denominator.
- Proof of wallet identity, manipulation, or misconduct from clustering alone.
- Scraping consumer pages or reverse-engineering private endpoints.
- Presenting a current API response as a historical point-in-time record.

## Product rules

- Exactly three top-level screens: Coins, Coin report, and Data & methods.
- Every screen has one primary task, and that task is its clearest heading.
- Real product content leads; technical framing and teaching open only when requested.
- Demo and live-current states never share an ambiguous label or visual treatment.
- A missing value stays unavailable; it is never silently changed to zero or borrowed from the present.
- Opportunity, integrity risk, tradability, and evidence quality remain separate.
- Claims match the actual source response, time coverage, implementation, and validation state.
- A new user can find the next action without reading a paragraph.
- Follow `DESIGN.md` for every interface change.
