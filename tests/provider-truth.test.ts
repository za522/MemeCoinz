import assert from "node:assert/strict";
import test from "node:test";

import { getDexScreenerToken } from "../lib/providers/dex-screener";
import { getTokenEnrichment } from "../lib/providers/enrichment";

const MINT = "So11111111111111111111111111111111111111112";
const OTHER_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function pairFor(mint: string) {
  return {
    chainId: "solana",
    dexId: "test-dex",
    pairAddress: "9d9mb8kooFfaD3SctgZtkxQypkshx6ezhbKio89ixyy2",
    baseToken: { address: mint, name: "Test token", symbol: "TEST" },
    quoteToken: { address: OTHER_MINT, name: "USD Coin", symbol: "USDC" },
    priceUsd: "0.001",
    liquidity: { usd: 10_000 },
  };
}

async function withFetchMock<T>(
  mock: typeof fetch,
  callback: () => Promise<T>,
): Promise<T> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mock;
  try {
    return await callback();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function dexFetch(options: { pairs: Response; orders: Response }): typeof fetch {
  return async (input) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.includes("/token-pairs/")) return options.pairs.clone();
    if (url.includes("/orders/")) return options.orders.clone();
    throw new Error(`Unexpected test request: ${url}`);
  };
}

test("DEX enrichment retains whichever component succeeds", async (t) => {
  await t.test("retains pairs when paid orders fail", async () => {
    const result = await withFetchMock(
      dexFetch({
        pairs: jsonResponse([pairFor(MINT)]),
        orders: jsonResponse({ error: "unavailable" }, 503),
      }),
      () => getDexScreenerToken(MINT),
    );

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.data.pairs.length, 1);
    assert.equal(result.data.paidOrders.length, 0);
    assert.equal(result.data.availability.pairs.available, true);
    assert.equal(result.data.availability.paidOrders.available, false);
    assert.equal(result.data.availability.paidOrders.errorCode, "upstream_error");
  });

  await t.test("retains paid orders when pairs fail", async () => {
    const result = await withFetchMock(
      dexFetch({
        pairs: jsonResponse({ error: "unavailable" }, 502),
        orders: jsonResponse({
          orders: [
            {
              tokenAddress: MINT,
              type: "tokenProfile",
              status: "approved",
              paymentTimestamp: 1_700_000_000_000,
            },
          ],
        }),
      }),
      () => getDexScreenerToken(MINT),
    );

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.data.pairs.length, 0);
    assert.equal(result.data.paidOrders.length, 1);
    assert.equal(result.data.paidOrders[0].tokenAddress, MINT);
    assert.equal(result.data.availability.pairs.available, false);
    assert.equal(result.data.availability.paidOrders.available, true);
  });

  await t.test("returns a total failure only when both components fail", async () => {
    const result = await withFetchMock(
      dexFetch({
        pairs: jsonResponse({ error: "unavailable" }, 502),
        orders: jsonResponse({ error: "unavailable" }, 503),
      }),
      () => getDexScreenerToken(MINT),
    );

    assert.equal(result.ok, false);
  });
});

function enrichmentFetch(options: {
  matchingPair: boolean;
  solanaSupply: boolean;
  paidOrdersFail?: boolean;
}): typeof fetch {
  return async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.includes("api.mainnet.solana.com")) {
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
      assert.equal(body.method, "getTokenSupply");
      return options.solanaSupply
        ? jsonResponse({
            jsonrpc: "2.0",
            id: "memetrace",
            result: {
              context: { slot: 123 },
              value: {
                amount: "1000000",
                decimals: 6,
                uiAmount: 1,
                uiAmountString: "1",
              },
            },
          })
        : jsonResponse({
            jsonrpc: "2.0",
            id: "memetrace",
            error: { code: -32602, message: "Invalid param" },
          });
    }
    if (url.includes("/token-pairs/")) {
      return jsonResponse(options.matchingPair ? [pairFor(MINT)] : []);
    }
    if (url.includes("/orders/")) {
      return options.paidOrdersFail
        ? jsonResponse({ error: "unavailable" }, 503)
        : jsonResponse({ orders: [] });
    }
    if (url.includes("api.jup.ag")) return jsonResponse({});
    throw new Error(`Unexpected test request: ${url}`);
  };
}

test("token confirmation is explicit and requires matching returned evidence", async () => {
  const previousMeteredFlag = process.env.TOKEN_ENRICHMENT_METERED_ENABLED;
  process.env.TOKEN_ENRICHMENT_METERED_ENABLED = "false";
  try {
    const confirmed = await withFetchMock(
      enrichmentFetch({
        matchingPair: true,
        solanaSupply: false,
        paidOrdersFail: true,
      }),
      () => getTokenEnrichment(MINT),
    );

    assert.deepEqual(confirmed.confirmation, {
      confirmed: true,
      confirmingProviderIds: ["dex-screener"],
    });
    assert.equal(confirmed.providers.dexScreener.status.state, "degraded");
    assert.match(
      confirmed.providers.dexScreener.status.message,
      /pair data was retained/i,
    );
    assert.equal(confirmed.providers.dexScreener.data?.pairs.length, 1);
    assert.equal(
      confirmed.providers.dexScreener.data?.availability.paidOrders.available,
      false,
    );

    const unconfirmed = await withFetchMock(
      enrichmentFetch({ matchingPair: false, solanaSupply: false }),
      () => getTokenEnrichment(MINT),
    );
    assert.equal(unconfirmed.confirmation.confirmed, false);
    assert.deepEqual(unconfirmed.confirmation.confirmingProviderIds, []);
    assert.equal(unconfirmed.providers.jupiter.data?.found, false);

    const chainConfirmed = await withFetchMock(
      enrichmentFetch({ matchingPair: false, solanaSupply: true }),
      () => getTokenEnrichment(MINT),
    );
    assert.equal(chainConfirmed.confirmation.confirmed, true);
    assert.deepEqual(chainConfirmed.confirmation.confirmingProviderIds, [
      "solana-rpc",
    ]);
  } finally {
    if (previousMeteredFlag === undefined) {
      delete process.env.TOKEN_ENRICHMENT_METERED_ENABLED;
    } else {
      process.env.TOKEN_ENRICHMENT_METERED_ENABLED = previousMeteredFlag;
    }
  }
});
