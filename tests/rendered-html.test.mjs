import assert from "node:assert/strict";
import test from "node:test";

const EXPECTED_PROVIDER_IDS = [
  "dex-screener",
  "fomo-family",
  "helius",
  "jito",
  "jupiter",
  "memescope-net",
  "photon",
  "pump-fun-ui",
  "pump-onchain",
  "solana-rpc",
  "solana-tracker",
  "x-api",
];

const PROVIDER_STATES = new Set([
  "connected",
  "degraded",
  "configured-unverified",
  "not-configured",
  "manual-only",
  "disabled",
]);

const HISTORICAL_COVERAGE = new Set([
  "canonical-archive",
  "vendor-archive",
  "mixed",
  "live-only",
  "none",
]);

const STORAGE_STATES = new Set([
  "written",
  "read-only",
  "unavailable",
  "failed",
]);

let renderSequence = 0;

async function render(pathname = "/", init = undefined) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set(
    "test",
    `${process.pid}-${Date.now()}-${renderSequence += 1}`,
  );
  const { default: worker } = await import(workerUrl.href);
  const accept = pathname.startsWith("/api/") ? "application/json" : "text/html";
  const headers = new Headers(init?.headers);
  if (!headers.has("accept")) headers.set("accept", accept);

  return worker.fetch(
    new Request(`http://localhost${pathname}`, { ...init, headers }),
    {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
    },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

function visibleHtml(html) {
  return html
    .replace(/<!--[^]*?-->/g, "")
    .replace(/<script\b[^>]*>[^]*?<\/script>/gi, "");
}

function countMatches(value, pattern) {
  return [...value.matchAll(pattern)].length;
}

function extractPrimaryNav(html) {
  const match = visibleHtml(html).match(
    /<nav[^>]*aria-label="Primary navigation"[^>]*>([^]*?)<\/nav>/i,
  );
  assert.ok(match, "expected an explicitly labelled primary navigation region");
  return match[1];
}

function extractSectionByClass(html, className) {
  const match = visibleHtml(html).match(
    new RegExp(
      `<(?:section|aside)[^>]*class="[^"]*\\b${className}\\b[^"]*"[^>]*>([^]*?)<\\/(?:section|aside)>`,
      "i",
    ),
  );
  assert.ok(match, `expected a ${className} section`);
  return match[1];
}

function assertPrimaryNav(html, activeLabel) {
  const primaryNav = extractPrimaryNav(html);
  assert.equal(countMatches(primaryNav, /<a\b/gi), 3);
  assert.equal(countMatches(primaryNav, /aria-current="page"/gi), 1);
  assert.match(primaryNav, />Coins<\/a>/i);
  assert.match(primaryNav, />Coin report<\/a>/i);
  assert.match(primaryNav, />Data &amp; methods<\/a>/i);
  assert.match(
    primaryNav,
    new RegExp(`aria-current="page"[^>]*>${activeLabel}<\\/a>`, "i"),
  );
  assert.doesNotMatch(
    primaryNav,
    /Research brief|Coordination|Narrative|Execution|Validation|Sources|Docs|Updates|Coverage/i,
  );
}

function assertSemanticScreen(html, h1) {
  const visible = visibleHtml(html);
  assert.match(visible, /<html[^>]*lang="en"/i);
  assert.equal(countMatches(visible, /<main\b/gi), 1);
  assert.equal(countMatches(visible, /<h1\b/gi), 1);
  assert.match(visible, new RegExp(`<h1>${h1}<\\/h1>`, "i"));
  assert.doesNotMatch(visible, /<button(?![^>]*\btype=)[^>]*>/i);
  assert.doesNotMatch(visible, /codex-preview|react-loading-skeleton/i);
}

function assertCoinShape(coin) {
  assert.equal(typeof coin.mint, "string");
  assert.equal(typeof coin.canonicalConfirmed, "boolean");
  assert.ok(coin.lifecycle && typeof coin.lifecycle === "object");
  assert.ok(["pump", "pump-swap", "unknown"].includes(coin.lifecycle.venue));
  assert.ok(["bonding", "graduated", "pool", "unknown"].includes(coin.lifecycle.stage));
  assert.ok(coin.market && typeof coin.market === "object");
  for (const key of [
    "priceUsd",
    "marketCapUsd",
    "liquidityUsd",
    "volume24hUsd",
    "buys24h",
    "sells24h",
    "priceChange24hPct",
    "pairAddress",
    "dexId",
    "pairCreatedAt",
    "observedAt",
  ]) {
    assert.ok(key in coin.market, `expected coin.market.${key}`);
  }
  assert.ok(Array.isArray(coin.provenance));
  assert.ok(Array.isArray(coin.missing));
}

test("server-renders exactly three primary destinations", async () => {
  const response = await render("/?screen=coins");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>MemeTrace · [^<]+<\/title>/i);
  assertPrimaryNav(html, "Coins");
  assertSemanticScreen(html, "Explore live coins");
});

test("Coins defaults to an honest real-feed loading state, not demo data", async () => {
  const response = await render("/?screen=coins");
  assert.equal(response.status, 200);
  const html = await response.text();
  const visible = visibleHtml(html);

  const feedStatus = extractSectionByClass(html, "feed-status");
  assert.match(feedStatus, /Live discovery/i);
  assert.match(feedStatus, /Loading real coins/i);
  assert.match(feedStatus, /Auto-refresh on/i);
  assert.match(feedStatus, /Refreshing/i);

  const feed = extractSectionByClass(html, "coin-feed");
  assert.match(feed, /Filter returned coins/i);
  assert.match(feed, /Name, ticker, or exact mint/i);
  assert.match(feed, /Scanning configured discovery sources/i);

  const coverage = extractSectionByClass(html, "coverage-strip");
  assert.match(coverage, /What this response actually covers/i);
  assert.match(coverage, /Canonical launches/i);
  assert.match(coverage, /Sources attempted/i);
  assert.match(coverage, /Storage/i);

  assert.match(visible, /Open a mint not shown above/i);
  assert.match(visible, /<label[^>]*for="mint-search"[^>]*>Solana contract address<\/label>/i);
  assert.doesNotMatch(visible, /Open demo|Synthetic demo, not a real token|unvalidated rule score/i);
});

test("Coin report requires a real selection and never defaults to an invented token", async () => {
  const response = await render("/?screen=report");
  assert.equal(response.status, 200);
  const html = await response.text();
  const visible = visibleHtml(html);

  assertPrimaryNav(html, "Coin report");
  assertSemanticScreen(html, "Choose a coin first");
  assert.match(visible, /Open a real row from Coins or paste an exact mint address/i);
  assert.match(visible, /Reports never default to invented token data/i);
  assert.match(visible, /Go to live coins/i);
  assert.doesNotMatch(visible, /Synthetic demo|illustrative heuristic|Evidence available 5 minutes/i);
});

test("Data and methods states the untrained research truth and keeps terminology search-first", async () => {
  const response = await render("/?screen=methods");
  assert.equal(response.status, 200);
  const html = await response.text();

  assertPrimaryNav(html, "Data &amp; methods");
  assertSemanticScreen(html, "Audit the research");

  const audit = extractSectionByClass(html, "audit-summary");
  assert.match(audit, /Connected is not complete/i);
  assert.match(audit, /Feature snapshots/i);
  assert.match(audit, /Matured outcomes/i);
  assert.match(audit, /Historical model fit/i);
  assert.match(audit, /Not enough data/i);
  assert.match(audit, /Telegram alerts/i);
  assert.match(audit, /Off/i);
  assert.match(audit, /Automatic trading/i);
  assert.match(audit, /Disabled/i);

  const benchmark = extractSectionByClass(html, "external-benchmark");
  assert.match(benchmark, /External research, not app coverage/i);
  assert.match(benchmark, /September–October 2025/i);
  assert.match(benchmark, /https:\/\/arxiv\.org\/abs\/2602\.14860/i);

  const glossary = extractSectionByClass(html, "glossary-section");
  assert.match(glossary, /<label[^>]*for="glossary-search"[^>]*>Term or idea<\/label>/i);
  assert.match(glossary, /<input[^>]*id="glossary-search"[^>]*type="search"/i);
  assert.match(glossary, /Search for a term to see its plain-English definition/i);
  assert.doesNotMatch(glossary, /<dl\b/i);
});

test("server-renders a focused terminology result from the query", async () => {
  const response = await render("/?screen=methods&term=HHI");
  assert.equal(response.status, 200);
  const html = await response.text();
  const glossary = extractSectionByClass(html, "glossary-section");

  assert.match(glossary, /<input[^>]*id="glossary-search"[^>]*value="HHI"/i);
  assert.match(glossary, /<dl\b/i);
  assert.match(glossary, /<dt><strong>HHI<\/strong>/i);
  assert.doesNotMatch(glossary, /<dt><strong>Slippage<\/strong>/i);
});

test("in-app terminology includes the real pipeline terms introduced in 0.4", async () => {
  const response = await render("/?screen=methods&term=Execution%20path");
  assert.equal(response.status, 200);
  const glossary = extractSectionByClass(await response.text(), "glossary-section");

  assert.match(glossary, /<dt><strong>Execution path<\/strong>/i);
  assert.match(glossary, /point-in-time entry/i);
  assert.match(glossary, /not a complete path/i);
  assert.doesNotMatch(glossary, /<dt><strong>HHI<\/strong>/i);
});

test("returns the real coin-feed contract with honest source and storage states", async () => {
  // Tracker-only is deterministic without a credential and avoids making the
  // test suite depend on public-RPC throughput. It still exercises the exact
  // production response contract and its unavailable-source truth state.
  const response = await render("/api/coins?source=tracker&limit=2&enrich=false");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-research-data"), "real-live-and-stored-observations");
  assert.equal(response.headers.get("x-source-policy"), "supported-apis-and-public-ledger-only");

  const body = await response.json();
  assert.match(body.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.ok(Array.isArray(body.coins));
  body.coins.forEach(assertCoinShape);
  assert.deepEqual(Object.keys(body.pagination).sort(), ["hasMore", "limit", "nextCursor"]);
  assert.equal(body.pagination.limit, 2);
  assert.equal(typeof body.pagination.hasMore, "boolean");
  assert.equal(body.ingestion.requestedSource, "tracker");
  assert.ok(Array.isArray(body.ingestion.discoverySources));
  assert.ok(body.ingestion.discoverySources.includes("solana-tracker"));
  assert.ok(Array.isArray(body.ingestion.coverage));
  assert.ok(Array.isArray(body.ingestion.warnings));
  assert.ok(STORAGE_STATES.has(body.ingestion.storage.state));
  for (const coverage of body.ingestion.coverage) {
    for (const field of [
      "sourceId",
      "signaturesScanned",
      "transactionsRequested",
      "transactionsDecoded",
      "exactCreatesFound",
      "exactMigrationsFound",
      "newestEventAt",
      "oldestEventAt",
      "partial",
    ]) assert.ok(field in coverage, `expected coverage.${field}`);
  }
  assert.doesNotMatch(JSON.stringify(body), /synthetic|illustrative fixture/i);
  assert.doesNotMatch(JSON.stringify(body), /(?:api-key=|bearer )[A-Za-z0-9_-]{12,}/i);
});

test("rejects malformed feed cursors instead of silently restarting discovery", async () => {
  const response = await render("/api/coins?cursor=definitely-not-a-returned-cursor");
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.error, "invalid_cursor");
});

test("rejects malformed exact-mint detail before contacting providers", async () => {
  const response = await render("/api/coins/not-a-solana-mint");
  assert.equal(response.status, 400);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.json();
  assert.equal(body.error, "invalid_mint");
  assert.match(body.message, /base58-encoded Solana address/i);
});

test("advanced collection GET is status-only and cannot consume provider quota", async () => {
  const response = await render("/api/collection/token");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(
    response.headers.get("x-research-data"),
    "bounded-real-provider-observations",
  );
  assert.equal(response.headers.get("x-automatic-trading"), "disabled");

  const body = await response.json();
  assert.equal(body.schemaVersion, "memetrace-token-collection-control/v1");
  assert.equal(body.executionMethod, "POST");
  assert.equal(body.authentication, "x-backfill-token");
  assert.equal(typeof body.configured, "boolean");
  assert.equal(body.meteredCallsOnGet, false);
  assert.equal(body.persistenceOnGet, false);
  assert.equal(body.trading, "disabled");
  assert.doesNotMatch(JSON.stringify(body), /api[_-]?key|bearer|bot[_-]?token/i);
});

test("point-in-time research rejects an unsupported cutoff without substituting a score", async () => {
  const mint = "So11111111111111111111111111111111111111112";
  const response = await render(
    `/api/coins/${mint}/research?referenceClock=launch&cutoffSeconds=42`,
  );
  assert.equal(response.status, 400);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-research-data"), "real-point-in-time-only");
  assert.equal(response.headers.get("x-automatic-trading"), "disabled");
  const body = await response.json();
  assert.equal(body.status, "invalid_request");
  assert.deepEqual(body.validCutoffSeconds, [30, 60, 300, 900, 3600]);
  assert.equal("probability" in body, false);
});

test("model research reports persisted-data insufficiency and never injects a demo cohort", async () => {
  const response = await render("/api/model/research");
  assert.ok(response.status === 200 || response.status === 503);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-research-data"), "persisted-point-in-time-only");
  const body = await response.json();
  assert.equal(body.status, "insufficient-data");
  assert.equal(typeof body.acceptedExamples, "number");
  assert.ok(body.acceptedExamples >= 0);
  assert.equal("artifact" in body, false);
  assert.doesNotMatch(JSON.stringify(body), /illustrative|synthetic|fixture/i);
});

test("alert status exposes the validated-shadow policy and never enables trading", async () => {
  const response = await render("/api/alerts");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(
    response.headers.get("x-alert-policy"),
    "validated-shadow-predictions-only",
  );
  assert.equal(response.headers.get("x-trading-enabled"), "false");

  const body = await response.json();
  assert.equal(typeof body.enabled, "boolean");
  assert.equal(typeof body.configured, "boolean");
  assert.equal(typeof body.probabilityThreshold, "number");
  assert.ok(body.probabilityThreshold >= 0 && body.probabilityThreshold <= 1);
  assert.equal(body.policy, "validated-shadow-predictions-only");
  assert.equal(body.tradingEnabled, false);
  assert.doesNotMatch(JSON.stringify(body), /bot[_-]?token|chat[_-]?id/i);
});

test("protected research runners reject unauthenticated mutation requests", async () => {
  for (const route of [
    {
      pathname: "/api/model/outcomes/materialize",
      researchData: "manual-matured-outcome-materialization",
      automaticTrading: "disabled",
    },
    {
      pathname: "/api/pipeline/run",
      pipeline: "bounded-protected-manual-run",
      automaticTrading: "disabled",
      transactionSubmission: "disabled",
    },
    {
      pathname: "/api/alerts",
      tradingEnabled: "false",
    },
  ]) {
    const { pathname } = route;
    const response = await render(pathname, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dryRun: true }),
    });
    assert.ok(response.status === 401 || response.status === 503);
    assert.equal(response.headers.get("cache-control"), "no-store");
    if (route.researchData) {
      assert.equal(response.headers.get("x-research-data"), route.researchData);
    }
    if (route.pipeline) {
      assert.equal(response.headers.get("x-research-pipeline"), route.pipeline);
    }
    if (route.automaticTrading) {
      assert.equal(response.headers.get("x-automatic-trading"), route.automaticTrading);
    }
    if (route.transactionSubmission) {
      assert.equal(response.headers.get("x-transaction-submission"), route.transactionSubmission);
    }
    if (route.tradingEnabled) {
      assert.equal(response.headers.get("x-trading-enabled"), route.tradingEnabled);
    }
    const body = await response.json();
    assert.ok(body.status === "unauthorized" || body.status === "not-configured");
    assert.equal("outcomesWritten" in body, false);
    assert.equal("delivered" in body, false);
    assert.equal("coins" in body, false);
  }
});

test("returns a complete policy-safe provider registry even when upstreams are unavailable", async () => {
  const response = await render("/api/sources");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-source-policy"), "no-scraping");

  const body = await response.json();
  assert.equal(body.policy.scraping, "disabled");
  assert.equal(body.policy.secrets, "server-only");
  assert.equal(body.policy.liveTrading, "disabled");

  const sourceIds = body.sources.map((source) => source.id);
  assert.equal(new Set(sourceIds).size, sourceIds.length);
  assert.deepEqual(sourceIds.toSorted(), EXPECTED_PROVIDER_IDS);
  for (const source of body.sources) {
    assert.ok(Array.isArray(source.interfaces));
    assert.ok(PROVIDER_STATES.has(source.status.state));
    assert.ok(HISTORICAL_COVERAGE.has(source.historicalCoverage));
    if (source.category === "reference-interface") {
      assert.equal(source.automated, false);
      assert.equal(source.access, "manual-only");
      assert.ok(source.status.state === "manual-only" || source.status.state === "disabled");
    }
  }
  assert.doesNotMatch(JSON.stringify(body), /(?:api-key=|bearer )[A-Za-z0-9_-]{12,}/i);
});

test("legacy mint enrichment still rejects malformed addresses before provider calls", async () => {
  const response = await render("/api/sources/token?mint=not-a-solana-mint");
  assert.equal(response.status, 400);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.json();
  assert.equal(body.error, "invalid_mint");
});
