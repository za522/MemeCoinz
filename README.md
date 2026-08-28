# MemeTrace research console

MemeTrace is the first working application for the memecoin intelligence research platform. It demonstrates the complete product shape without pretending that a synthetic fixture is a profitable trading signal.

## Implemented

- Point-in-time replay at `30s`, `1m`, `5m`, `15m`, and `1h`.
- Leakage-safe selection using `eventTime`, `observedAt`, and `availableAt`.
- Lifecycle, liquidity, execution, ownership, creator, coordination, wash, narrative, paid-attention, market-regime, and source-fidelity evidence.
- Four independent outputs: opportunity, integrity risk, executability, and evidence confidence.
- Token time machine, wallet investigation, narrative analysis, execution simulator, validation protocol, and source registry.
- A typed JSON research API at `/api/research?cutoff=5m`.
- A server-only provider registry at `/api/sources` with live health, exact interfaces, credentials, and historical boundaries.
- Read-only mint enrichment at `/api/sources/token?mint={solana_address}`.
- Live-tested public adapters for Solana JSON-RPC, DEX Screener, Jupiter Price v3, and Jito read-only evidence.
- Credential-gated adapters for Helius DAS, Solana Tracker token data, and X exact-mint recent counts.
- An in-app source ledger, concise update log, and searchable terminology appendix.
- D1 tables for sources, assets, observations, feature snapshots, outcomes, predictions, execution probes, and experiments.
- R2 binding contract for immutable raw research payloads.
- A synthetic replay fixture that is visibly identified as illustrative and unvalidated.

## Not yet claimed

- No real historical cohort has been ingested into this deployment.
- No Helius, Solana Tracker, X, or production Jupiter credential is installed.
- Public connection probes and current mint lookups are not a historical launch collector.
- Pump/PumpSwap program IDs are registered, but the decoder, archive backfill, and live event collector are not running.
- Fomo.family, Photon, Pump.fun consumer pages, and memescope.net are not scraped; they remain manual, disabled, or partnership-gated according to the in-app ledger.
- No reported score is a trained probability or a recommendation to trade.
- Live shadow prediction collection, source persistence, and automatic execution are disabled.

## Run locally

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

## Provider configuration

Copy `.env.example` to `.env.local` and add only the server credentials you are authorized to use:

```bash
SOLANA_RPC_URL=https://api.mainnet.solana.com
HELIUS_API_KEY=
SOLANA_TRACKER_API_KEY=
X_BEARER_TOKEN=
JUPITER_API_KEY=
TOKEN_ENRICHMENT_METERED_ENABLED=false
```

Metered Helius, Solana Tracker, and X mint lookups require both the relevant key and
`TOKEN_ENRICHMENT_METERED_ENABLED=true`. Keep that gate off until quota, cost, retention,
and display rights have been reviewed. Never expose these values through a `NEXT_PUBLIC_`
variable.

## Verify

```bash
npm run lint
npx tsc --noEmit
npm run db:generate
npm test
```

`npm test` builds the Cloudflare/Vinext application and checks the rendered console and research API.

## Persistence

`.openai/hosting.json` declares `DB` as a Cloudflare D1 binding and `RAW_RESEARCH` as an R2 binding. D1 stores normalized and queryable records. R2 stores append-only source responses referenced by `raw_object_key`. Collectors are designed to run asynchronously outside the user request path.

See the root [technical architecture](../docs/08-technical-architecture.md), [historical source contract](../docs/09-historical-source-contract.md), [source connection ledger](../docs/10-source-connections-and-changelog.md), and [terminology appendix](../docs/11-terminology-appendix.md) before expanding collection.
