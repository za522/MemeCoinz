import assert from "node:assert/strict";
import test from "node:test";
import { formatShadowAlert } from "../lib/alerts/telegram";

test("shadow alert states evidence, target, mint, and no-trade boundary", () => {
  const message = formatShadowAlert({
    name: "Research Coin",
    symbol: "RSC",
    mint: "7YWHMfk9JZe0LM0g1wKXLrQJB4BQPZnMHv3NDT2gxcJH",
    probability: 0.834,
    lowerBound: 0.72,
    upperBound: 0.91,
    referenceClock: "launch",
    cutoffSeconds: 300,
    horizonSeconds: 86_400,
    orderSizeUsd: 100,
    publicAppUrl: "https://example.test",
  });

  assert.match(message, /83\.4% calibrated pump probability/);
  assert.match(message, /72%–91% interval/);
  assert.match(message, /5m after launch/);
  assert.match(message, /\$100 order · 24h horizon/);
  assert.match(message, /screen=report&mint=/);
  assert.match(message, /No trade was submitted/);
});

test("shadow alert does not invent an unavailable interval or target", () => {
  const message = formatShadowAlert({
    name: "Sparse Coin",
    symbol: "SPARSE",
    mint: "mint",
    probability: 0.81,
    lowerBound: null,
    upperBound: null,
    referenceClock: "graduation",
    cutoffSeconds: 60,
    horizonSeconds: null,
    orderSizeUsd: null,
    publicAppUrl: null,
  });

  assert.match(message, /interval unavailable/);
  assert.match(message, /1m after graduation/);
  assert.doesNotMatch(message, /order|horizon/);
});

