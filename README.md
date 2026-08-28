# MemeTrace

MemeTrace is a point-in-time memecoin research application. The interface is intentionally limited to three tasks: find a coin, understand one coin, and audit the data and methods. It does not present a synthetic fixture as a profitable trading signal.

## Implemented

- Exactly three top-level screens: **Coins**, **Coin report**, and **Data & methods**.
- Exact Solana address lookup with explicit submit, separate token confirmation, honest partial/error states, and no metered request while typing.
- Point-in-time demo replay at `30s`, `1m`, `5m`, `15m`, and `1h`, visibly labelled synthetic and unvalidated.
- Four independent assessments: opportunity, integrity risk, tradability, and evidence quality. They are never averaged into a buy score.
- Progressive evidence disclosure for flow, ownership, coordination, narrative, execution, outcomes, and source fidelity.
- A search-first terminology appendix and an exact source/rights ledger under **Data & methods**.
- Point-in-time selection that requires `eventTime`, `observedAt`, and `availableAt` to fall no later than the chosen cutoff.
- A typed JSON research API at `/api/research?cutoff=5m`.
- A server-only provider registry at `/api/sources` with live health, exact interfaces, credentials, and historical boundaries.
- Read-only mint enrichment at `/api/sources/token?mint={solana_address}`.
- Public adapters for Solana JSON-RPC, DEX Screener, Jupiter Price v3, and Jito read-only evidence. Development smoke probes passed; automated tests verify response contracts while allowing upstream outages.
- Credential-gated adapters for Helius DAS, Solana Tracker token data, and X exact-mint recent counts.
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

`.openai/hosting.json` declares `DB` as a Cloudflare D1 binding and `RAW_RESEARCH` as an R2 binding. The schemas reserve D1 for normalized records and R2 for append-only source responses referenced by `raw_object_key`; this release does not run the collector or persist provider responses.

See the root [technical architecture](../docs/08-technical-architecture.md), [historical source contract](../docs/09-historical-source-contract.md), [source connection ledger](../docs/10-source-connections-and-changelog.md), and [terminology appendix](../docs/11-terminology-appendix.md) before expanding collection.
