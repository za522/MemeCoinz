import assert from "node:assert/strict";
import test from "node:test";

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
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

test("server-renders the MemeTrace research console", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  const visibleHtml = html.replace(/<!--.*?-->/g, "");
  assert.match(html, /<title>MemeTrace · Point-in-time memecoin research<\/title>/i);
  assert.match(visibleHtml, /Could this have been known at 5m\?/);
  assert.match(html, /Illustrative replay fixture/);
  assert.match(html, /Opportunity/);
  assert.match(html, /Integrity risk/);
  assert.match(html, /Executability/);
  assert.match(html, /Evidence confidence/);
  assert.match(html, /Sources &amp; fidelity/);
  assert.match(html, /Docs &amp; terminology/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("returns a leakage-safe research summary from the API", async () => {
  const response = await render("/api/research?cutoff=1m");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-research-data"), "illustrative-fixture");

  const summary = await response.json();
  assert.equal(summary.selectedCutoff.cutoff.label, "1m");
  assert.equal(summary.selectedCutoff.outputs.opportunity.status, "illustrative-heuristic-not-validated");
  assert.equal(summary.mode, "illustrative-historical-replay");
});

test("rejects unknown replay cutoffs", async () => {
  const response = await render("/api/research?cutoff=tomorrow");
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.error, "invalid_cutoff");
});

test("returns a policy-safe provider registry even when an upstream is unavailable", async () => {
  const response = await render("/api/sources");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-source-policy"), "no-scraping");

  const body = await response.json();
  assert.equal(body.policy.secrets, "server-only");
  assert.equal(body.policy.liveTrading, "disabled");
  assert.ok(body.sources.some((source) => source.id === "solana-rpc"));
  assert.ok(body.sources.some((source) => source.id === "dex-screener"));
  assert.ok(body.sources.some((source) => source.id === "pump-onchain"));
  assert.ok(body.sources.some((source) => source.id === "jito"));
  assert.ok(body.sources.every((source) => Array.isArray(source.interfaces)));
  assert.doesNotMatch(JSON.stringify(body), /(?:api-key=|bearer )[A-Za-z0-9_-]{12,}/i);
});

test("rejects malformed mint enrichment requests before contacting providers", async () => {
  const response = await render("/api/sources/token?mint=not-a-solana-mint");
  assert.equal(response.status, 400);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.json();
  assert.equal(body.error, "invalid_mint");
});
