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
