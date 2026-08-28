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

let renderSequence = 0;

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set(
    "test",
    `${process.pid}-${Date.now()}-${renderSequence += 1}`,
  );
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${pathname}`, {
      headers: { accept: pathname.startsWith("/api/") ? "application/json" : "text/html" },
    }),
    {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
    },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

function visibleHtml(html) {
  return html.replace(/<!--[\s\S]*?-->/g, "");
}

function countMatches(value, pattern) {
  return [...value.matchAll(pattern)].length;
}

function extractPrimaryNav(html) {
  const match = visibleHtml(html).match(
    /<nav[^>]*aria-label="Primary navigation"[^>]*>([\s\S]*?)<\/nav>/i,
  );
  assert.ok(match, "expected an explicitly labelled primary navigation region");
  return match[1];
}

function extractSectionByClass(html, className) {
  const match = visibleHtml(html).match(
    new RegExp(
      `<(?:section|aside)[^>]*class="[^"]*\\b${className}\\b[^"]*"[^>]*>([\\s\\S]*?)<\\/(?:section|aside)>`,
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

test("server-renders exactly three primary destinations", async () => {
  const response = await render("/?screen=coins");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>MemeTrace · [^<]+<\/title>/i);
  assertPrimaryNav(html, "Coins");
  assertSemanticScreen(html, "Find a coin");
});

test("Coins separates app coverage from the synthetic demo", async () => {
  const response = await render("/?screen=coins");
  assert.equal(response.status, 200);
  const html = await response.text();

  const coverage = extractSectionByClass(html, "coverage-strip");
  assert.match(coverage, /App coverage/i);
  assert.match(coverage, /Historical launches/i);
  assert.match(coverage, /Not ingested/i);
  assert.doesNotMatch(coverage, /September|October/i);

  const demo = extractSectionByClass(html, "demo-entry");
  assert.match(demo, /Demo data/i);
  assert.match(demo, /not a real token or a backtest result/i);
  assert.match(demo, /Open demo/i);
  assert.match(html, /<label[^>]*for="mint-search"[^>]*>Solana contract address<\/label>/i);
  assert.match(html, /<input[^>]*id="mint-search"[^>]*name="mint"/i);
});

test("Coin report labels the synthetic heuristic and keeps four separate assessments", async () => {
  const response = await render("/?screen=report");
  assert.equal(response.status, 200);
  const html = await response.text();
  const visible = visibleHtml(html);

  assertPrimaryNav(html, "Coin report");
  assertSemanticScreen(html, "Understand this coin");
  assert.match(visible, /Evidence available 5 minutes after launch/i);
  assert.match(
    visible,
    /<div[^>]*class="truth-notice"[^>]*role="note"[^>]*>[\s\S]*?Synthetic demo, not a real token\.[\s\S]*?unvalidated heuristic, not a probability and not a trade recommendation\.[\s\S]*?<\/div>/i,
  );

  const assessments = extractSectionByClass(html, "assessment-rail");
  for (const label of ["Opportunity", "Integrity risk", "Tradability", "Evidence quality"]) {
    assert.match(assessments, new RegExp(`>${label}<`, "i"));
  }
  assert.equal(countMatches(assessments, /<details\b/gi), 4);
  assert.equal(countMatches(assessments, /<summary>How this was calculated<\/summary>/gi), 4);
  assert.doesNotMatch(visible, /Buy now|Trade now|Auto-buy|Send trade/i);

  const cutoffGroup = visible.match(
    /<div[^>]*role="group"[^>]*aria-label="Evidence cutoff after launch"[^>]*>([\s\S]*?)<\/div>/i,
  );
  assert.ok(cutoffGroup, "expected an accessible evidence-cutoff control");
  assert.equal(countMatches(cutoffGroup[1], /<button\b/gi), 5);
  assert.equal(countMatches(cutoffGroup[1], /aria-pressed="true"/gi), 1);
});

test("Data and methods distinguishes the external benchmark and keeps glossary search-first", async () => {
  const response = await render("/?screen=methods");
  assert.equal(response.status, 200);
  const html = await response.text();

  assertPrimaryNav(html, "Data &amp; methods");
  assertSemanticScreen(html, "Audit the research");

  const audit = extractSectionByClass(html, "audit-summary");
  assert.match(audit, /Historical cohort/i);
  assert.match(audit, /Not ingested/i);
  assert.doesNotMatch(audit, /September|October/i);

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

test("server-renders a focused glossary result from the query", async () => {
  const response = await render("/?screen=methods&term=HHI");
  assert.equal(response.status, 200);
  const html = await response.text();
  const glossary = extractSectionByClass(html, "glossary-section");

  assert.match(glossary, /<input[^>]*id="glossary-search"[^>]*value="HHI"/i);
  assert.match(glossary, /<dl\b/i);
  assert.match(glossary, /<dt><strong>HHI<\/strong>/i);
  assert.doesNotMatch(glossary, /<dt><strong>Slippage<\/strong>/i);
});

test("returns a leakage-safe research summary from the API", async () => {
  const response = await render("/api/research?cutoff=1m");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-research-data"), "illustrative-fixture");

  const summary = await response.json();
  assert.equal(summary.selectedCutoff.cutoff.label, "1m");
  assert.equal(summary.mode, "illustrative-historical-replay");
  assert.match(summary.fixtureLabel, /illustrative replay/i);
  assert.match(summary.disclaimer, /not model output or trading advice/i);
  assert.deepEqual(
    Object.keys(summary.selectedCutoff.outputs).sort(),
    ["evidenceConfidence", "executability", "integrityRisk", "opportunity"],
  );
  for (const assessment of Object.values(summary.selectedCutoff.outputs)) {
    assert.equal(assessment.status, "illustrative-heuristic-not-validated");
  }
  assert.equal(
    summary.selectedCutoff.marketRegime.riskAppetiteScore0To100,
    68,
    "the 60-second regime record was not observed until 90 seconds and must be excluded",
  );
});

test("rejects unknown replay cutoffs", async () => {
  const response = await render("/api/research?cutoff=tomorrow");
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.error, "invalid_cutoff");
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

test("rejects malformed mint enrichment requests before contacting providers", async () => {
  const response = await render("/api/sources/token?mint=not-a-solana-mint");
  assert.equal(response.status, 400);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.json();
  assert.equal(body.error, "invalid_mint");
});

test("returns the complete live-enrichment shape without requiring upstream success", async () => {
  const mint = "So11111111111111111111111111111111111111112";
  const response = await render(`/api/sources/token?mint=${mint}`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-research-data"), "live-point-in-time-enrichment");

  const body = await response.json();
  assert.equal(body.mint, mint);
  assert.equal(typeof body.meteredProvidersEnabled, "boolean");
  assert.equal(typeof body.confirmation.confirmed, "boolean");
  assert.ok(Array.isArray(body.confirmation.confirmingProviderIds));
  if (!body.confirmation.confirmed) {
    assert.deepEqual(body.confirmation.confirmingProviderIds, []);
  }
  assert.match(body.warning, /not a validated signal or trading instruction/i);
  assert.deepEqual(
    Object.keys(body.providers).sort(),
    ["dexScreener", "helius", "jupiter", "solana", "solanaTracker", "xRecentCounts"],
  );
  for (const provider of Object.values(body.providers)) {
    assert.ok(PROVIDER_STATES.has(provider.status.state));
    assert.ok(provider.data === null || typeof provider.data === "object");
  }
  if (body.providers.dexScreener.data) {
    assert.equal(
      typeof body.providers.dexScreener.data.availability.pairs.available,
      "boolean",
    );
    assert.equal(
      typeof body.providers.dexScreener.data.availability.paidOrders.available,
      "boolean",
    );
  }
  assert.doesNotMatch(JSON.stringify(body), /(?:api-key=|bearer )[A-Za-z0-9_-]{12,}/i);
});
