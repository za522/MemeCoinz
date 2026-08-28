# MemeTrace research console

MemeTrace is the first working application for the memecoin intelligence research platform. It demonstrates the complete product shape without pretending that a synthetic fixture is a profitable trading signal.

## Implemented

- Point-in-time replay at `30s`, `1m`, `5m`, `15m`, and `1h`.
- Leakage-safe selection using `eventTime`, `observedAt`, and `availableAt`.
- Lifecycle, liquidity, execution, ownership, creator, coordination, wash, narrative, paid-attention, market-regime, and source-fidelity evidence.
- Four independent outputs: opportunity, integrity risk, executability, and evidence confidence.
- Token time machine, wallet investigation, narrative analysis, execution simulator, validation protocol, and source registry.
- A typed JSON research API at `/api/research?cutoff=5m`.
- D1 tables for sources, assets, observations, feature snapshots, outcomes, predictions, execution probes, and experiments.
- R2 binding contract for immutable raw research payloads.
- A synthetic replay fixture that is visibly identified as illustrative and unvalidated.

## Not yet claimed

- No real historical cohort has been ingested into this deployment.
- No X, archival Solana, routing, DEX Screener, Solana Tracker, Pump.fun, or Fomo.family credentials are installed.
- No reported score is a trained probability or a recommendation to trade.
- Live shadow collection and automatic execution are disabled.

## Run locally

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

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

See the root [technical architecture](../docs/08-technical-architecture.md) and [historical source contract](../docs/09-historical-source-contract.md) before connecting providers.
