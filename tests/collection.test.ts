import assert from "node:assert/strict";
import test from "node:test";

import { GET as collectionStatus, POST as runCollection } from "../app/api/collection/token/route";
import { collectTokenResearchInputs } from "../lib/collection/token";
import { getHeliusTransactionsForAddress } from "../lib/providers/helius";
import { getJitoCurrentTipEvidence } from "../lib/providers/jito";
import { probeJupiterRoundTrips } from "../lib/providers/jupiter";
import { getSolanaTrackerTokenTrades } from "../lib/providers/solana-tracker";
import {
  buildXIdentityQuery,
  getXIdentityCounts,
  searchXIdentityPosts,
} from "../lib/providers/x";

const MINT = "6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function withFetchMock<T>(mock: typeof fetch, callback: () => Promise<T>) {
  const original = globalThis.fetch;
  globalThis.fetch = mock;
  try {
    return await callback();
  } finally {
    globalThis.fetch = original;
  }
}

function restoreEnv(name: string, previous: string | undefined) {
  if (previous === undefined) delete process.env[name];
  else process.env[name] = previous;
}

test("X collection uses exact identities, bounded pagination, and current-metric timestamps", async () => {
  const previous = process.env.X_BEARER_TOKEN;
  process.env.X_BEARER_TOKEN = "test-x-token";
  const requestedUrls: URL[] = [];
  try {
    const result = await withFetchMock(async (input) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      requestedUrls.push(url);
      const secondPage = url.searchParams.get("next_token") === "page-two";
      return json({
        data: [{
          id: secondPage ? "post-2" : "post-1",
          author_id: "author-1",
          created_at: secondPage ? "2026-08-27T00:01:00Z" : "2026-08-27T00:02:00Z",
          text: secondPage ? "See https://example.com/token" : `contract ${MINT}`,
          lang: "en",
          public_metrics: { like_count: secondPage ? 3 : 7, retweet_count: 1 },
          entities: secondPage
            ? { urls: [{ expanded_url: "https://example.com/token" }] }
            : {},
        }],
        includes: {
          users: [{
            id: "author-1",
            username: "researcher",
            name: "Researcher",
            verified: true,
            public_metrics: { followers_count: 1234 },
          }],
        },
        meta: secondPage ? {} : { next_token: "page-two" },
      });
    }, () => searchXIdentityPosts({
      identity: {
        contractAddress: MINT,
        fullName: "Official Trump",
        officialUrls: ["https://example.com/token"],
      },
      startTime: "2026-08-27T00:00:00Z",
      endTime: "2026-08-28T00:00:00Z",
      mode: "recent",
      maxPages: 2,
      maxResults: 20,
    }));
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.data.posts.length, 2);
    assert.equal(result.data.pagesFetched, 2);
    assert.equal(result.data.posts[0].identityMatches[0], "exact-contract");
    assert.deepEqual(result.data.posts[1].identityMatches, ["official-url"]);
    assert.equal(result.data.posts[0].publicMetrics.likeCount, 7);
    assert.notEqual(
      result.data.posts[0].publicMetricsObservedAt,
      result.data.posts[0].createdAt,
    );
    assert.equal(requestedUrls[1].searchParams.get("next_token"), "page-two");
    assert.match(requestedUrls[0].searchParams.get("query") ?? "", new RegExp(MINT));
    assert.match(result.data.caveat, /mutable current values/i);
  } finally {
    restoreEnv("X_BEARER_TOKEN", previous);
  }
});

test("X identity query never falls back to ticker-only matching", () => {
  const query = buildXIdentityQuery({
    contractAddress: MINT,
    fullName: "Official Trump",
    officialUrls: ["https://example.com/token"],
  });
  assert.match(query, new RegExp(MINT));
  assert.match(query, /"Official Trump"/);
  assert.doesNotMatch(query, /\$TRUMP/);
});

test("X aggregate counts declare only the exact identity classes present in their query", async () => {
  const previous = process.env.X_BEARER_TOKEN;
  process.env.X_BEARER_TOKEN = "test-x-token";
  try {
    const result = await withFetchMock(async () => json({
      data: [{
        start: "2026-08-27T00:00:00.000Z",
        end: "2026-08-27T01:00:00.000Z",
        post_count: 3,
      }],
      meta: {},
    }), () => getXIdentityCounts({
      identity: { contractAddress: MINT },
      startTime: "2026-08-27T00:00:00.000Z",
      endTime: "2026-08-27T01:00:00.000Z",
      mode: "recent",
      maxPages: 1,
    }));
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.data.identityClasses, ["exact-contract"]);
  } finally {
    restoreEnv("X_BEARER_TOKEN", previous);
  }
});

test("Helius history sends bounded chronological time filters and keeps a lossless row", async () => {
  const previous = process.env.HELIUS_API_KEY;
  process.env.HELIUS_API_KEY = "test-helius-key";
  let requestBody: unknown;
  try {
    const result = await withFetchMock(async (_input, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return json({
        jsonrpc: "2.0",
        result: {
          data: [{
            slot: 123,
            transactionIndex: 4,
            blockTime: 1_735_689_660,
            confirmationStatus: "finalized",
            transaction: {
              signatures: ["signature-one"],
              message: { accountKeys: ["WalletOne", "WalletTwo"] },
            },
            meta: {
              err: null,
              fee: 5000,
              preBalances: [10000, 0],
              postBalances: [4000, 1000],
              preTokenBalances: [{
                accountIndex: 1,
                mint: MINT,
                owner: "WalletTwo",
                uiTokenAmount: { amount: "0", decimals: 6, uiAmount: 0 },
              }],
              postTokenBalances: [{
                accountIndex: 1,
                mint: MINT,
                owner: "WalletTwo",
                uiTokenAmount: { amount: "2500000", decimals: 6, uiAmount: 2.5 },
              }],
            },
          }],
          paginationToken: null,
        },
      });
    }, () => getHeliusTransactionsForAddress(MINT, {
      from: "2025-01-01T00:00:00Z",
      to: "2025-01-02T00:00:00Z",
      maxPages: 1,
      maxTransactions: 10,
      commitment: "finalized",
    }));
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.data.transactions[0].tokenBalanceChanges[0].rawDelta, "2500000");
    assert.equal(result.data.transactions[0].raw.slot, 123);
    assert.ok(requestBody && typeof requestBody === "object");
    const params = (requestBody as Record<string, unknown>).params as unknown[];
    const configuration = params[1] as Record<string, unknown>;
    assert.equal(configuration.sortOrder, "asc");
    assert.equal(configuration.limit, 10);
    assert.deepEqual(
      (configuration.filters as Record<string, unknown>).blockTime,
      { gte: 1_735_689_600, lt: 1_735_776_000 },
    );
  } finally {
    restoreEnv("HELIUS_API_KEY", previous);
  }
});

test("Solana Tracker trade paging stops after crossing the lower event-time bound", async () => {
  const previous = process.env.SOLANA_TRACKER_API_KEY;
  process.env.SOLANA_TRACKER_API_KEY = "test-tracker-key";
  let requests = 0;
  try {
    const result = await withFetchMock(async (input) => {
      requests += 1;
      const url = new URL(input instanceof Request ? input.url : String(input));
      assert.equal(url.searchParams.get("hideArb"), "true");
      if (requests === 1) {
        return json({
          trades: [{
            tx: "inside-window",
            amount: 12,
            priceUsd: 0.1,
            volume: 1.2,
            volumeSol: 0.01,
            type: "buy",
            wallet: "WalletOne",
            time: Date.parse("2025-01-01T00:30:00Z"),
            program: "pumpfun-amm",
            pools: ["PoolOne"],
          }],
          nextCursor: 123,
          hasNextPage: true,
        });
      }
      assert.equal(url.searchParams.get("cursor"), "123");
      return json({
        trades: [{
          tx: "too-old",
          amount: 2,
          type: "sell",
          time: Date.parse("2024-12-31T23:59:00Z"),
        }],
        nextCursor: 456,
        hasNextPage: true,
      });
    }, () => getSolanaTrackerTokenTrades(MINT, {
      from: "2025-01-01T00:00:00Z",
      to: "2025-01-01T01:00:00Z",
      maxPages: 5,
    }));
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(requests, 2);
    assert.equal(result.data.trades.length, 1);
    assert.equal(result.data.trades[0].signature, "inside-window");
    assert.match(result.data.caveat, /availability is recorded at retrieval/i);
  } finally {
    restoreEnv("SOLANA_TRACKER_API_KEY", previous);
  }
});

test("Jupiter probes use read-only public-lite buy and sell quotes", async () => {
  const previousGate = process.env.TOKEN_ENRICHMENT_METERED_ENABLED;
  const previousKey = process.env.JUPITER_API_KEY;
  process.env.TOKEN_ENRICHMENT_METERED_ENABLED = "false";
  process.env.JUPITER_API_KEY = "configured-but-gated";
  const methods: string[] = [];
  try {
    const result = await withFetchMock(async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      methods.push(init?.method ?? "GET");
      assert.equal(url.hostname, "lite-api.jup.ag");
      const isSell = url.searchParams.get("outputMint") === USDC;
      return json({
        inputMint: url.searchParams.get("inputMint"),
        outputMint: url.searchParams.get("outputMint"),
        inAmount: url.searchParams.get("amount"),
        outAmount: isSell ? "99000000" : "1000000",
        otherAmountThreshold: isSell ? "98000000" : "990000",
        priceImpactPct: isSell ? "0.02" : "0.01",
        contextSlot: 999,
        timeTaken: 0.01,
        routePlan: [],
      });
    }, () => probeJupiterRoundTrips(MINT, {
      orderSizesUsd: [100],
      slippageBps: 100,
      allowMeteredCredential: true,
    }));
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(methods, ["GET", "GET"]);
    assert.equal(result.data[0].expectedRoundTripUsd, 99);
    assert.equal(result.data[0].roundTripRetentionPct, 99);
    assert.equal(result.data[0].endpointMode, "public-lite");
  } finally {
    restoreEnv("TOKEN_ENRICHMENT_METERED_ENABLED", previousGate);
    restoreEnv("JUPITER_API_KEY", previousKey);
  }
});

test("Jito collector reads current tip evidence without bundle submission", async () => {
  const methods: string[] = [];
  const result = await withFetchMock(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    methods.push(`${init?.method ?? "GET"} ${url.pathname}`);
    if (url.pathname.endsWith("getTipAccounts")) {
      return json({
        jsonrpc: "2.0",
        result: ["96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5"],
      });
    }
    return json([{
      time: "2026-08-28T00:00:00Z",
      landed_tips_25th_percentile: 0.000001,
      landed_tips_50th_percentile: 0.000002,
      landed_tips_75th_percentile: 0.000003,
      landed_tips_95th_percentile: 0.000004,
      landed_tips_99th_percentile: 0.000005,
      ema_landed_tips_50th_percentile: 0.000002,
    }]);
  }, () => getJitoCurrentTipEvidence());
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.tipAccounts.length, 1);
  assert.equal(result.data.latestTipFloor?.landedTips50thPercentileSol, 0.000002);
  assert.equal(methods.some((method) => /sendBundle|sendTransaction/.test(method)), false);
  assert.match(result.data.caveat, /no complete historical bundle archive/i);
});

test("token collector gates all credentialed providers and emits current quote observations", async () => {
  const environment = {
    gate: process.env.TOKEN_ENRICHMENT_METERED_ENABLED,
    x: process.env.X_BEARER_TOKEN,
    helius: process.env.HELIUS_API_KEY,
    tracker: process.env.SOLANA_TRACKER_API_KEY,
  };
  process.env.TOKEN_ENRICHMENT_METERED_ENABLED = "false";
  delete process.env.X_BEARER_TOKEN;
  delete process.env.HELIUS_API_KEY;
  delete process.env.SOLANA_TRACKER_API_KEY;
  try {
    const response = await withFetchMock(async (input) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.hostname === "lite-api.jup.ag") {
        const isSell = url.searchParams.get("outputMint") === USDC;
        return json({
          inputMint: url.searchParams.get("inputMint"),
          outputMint: url.searchParams.get("outputMint"),
          inAmount: url.searchParams.get("amount"),
          outAmount: isSell ? "9900000" : "100000",
          priceImpactPct: "0.01",
          routePlan: [],
        });
      }
      if (url.pathname.endsWith("getTipAccounts")) {
        return json({ result: ["96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5"] });
      }
      if (url.hostname === "bundles.jito.wtf") {
        return json([{ time: "2026-08-28T00:00:00Z" }]);
      }
      throw new Error(`Unexpected request: ${url}`);
    }, () => collectTokenResearchInputs(MINT, {
      from: "2026-08-27T23:00:00Z",
      to: "2026-08-28T00:00:00Z",
      orderSizesUsd: [10],
      maxPages: 1,
      persistCoin: null,
    }));
    assert.equal(response.providers.helius.state, "skipped-disabled");
    assert.equal(response.providers.solanaTracker.state, "skipped-disabled");
    assert.equal(response.providers.x.state, "skipped-disabled");
    assert.equal(response.providers.jupiter.state, "collected");
    assert.equal(response.persistence.state, "read-only");
    assert.equal(
      response.coinObservations.filter((item) => item.observationType === "execution_quote").length,
      2,
    );
    assert.equal(response.policy.transactionSubmission, "disabled");
  } finally {
    restoreEnv("TOKEN_ENRICHMENT_METERED_ENABLED", environment.gate);
    restoreEnv("X_BEARER_TOKEN", environment.x);
    restoreEnv("HELIUS_API_KEY", environment.helius);
    restoreEnv("SOLANA_TRACKER_API_KEY", environment.tracker);
  }
});

test("collection GET is status-only and POST rejects an invalid admin token before fetch", async () => {
  const previous = process.env.BACKFILL_ADMIN_TOKEN;
  process.env.BACKFILL_ADMIN_TOKEN = "correct-token";
  let fetchCalls = 0;
  try {
    await withFetchMock(async () => {
      fetchCalls += 1;
      throw new Error("status/auth checks must not fetch");
    }, async () => {
      const status = await collectionStatus();
      assert.equal(status.status, 200);
      const statusBody = await status.json() as Record<string, unknown>;
      assert.equal(statusBody.meteredCallsOnGet, false);
      assert.equal(statusBody.persistenceOnGet, false);

      const unauthorized = await runCollection(new Request("http://localhost/api/collection/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-backfill-token": "wrong-token",
        },
        body: JSON.stringify({ mint: MINT }),
      }));
      assert.equal(unauthorized.status, 401);
    });
    assert.equal(fetchCalls, 0);
  } finally {
    restoreEnv("BACKFILL_ADMIN_TOKEN", previous);
  }
});

test("internal collection defaults to public probes even when metered keys and gate exist", async () => {
  const environment = {
    gate: process.env.TOKEN_ENRICHMENT_METERED_ENABLED,
    x: process.env.X_BEARER_TOKEN,
    helius: process.env.HELIUS_API_KEY,
    tracker: process.env.SOLANA_TRACKER_API_KEY,
  };
  process.env.TOKEN_ENRICHMENT_METERED_ENABLED = "true";
  process.env.X_BEARER_TOKEN = "configured-x";
  process.env.HELIUS_API_KEY = "configured-helius";
  process.env.SOLANA_TRACKER_API_KEY = "configured-tracker";
  const hosts: string[] = [];
  try {
    const response = await withFetchMock(async (input) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      hosts.push(url.hostname);
      if (url.hostname === "lite-api.jup.ag") {
        const isSell = url.searchParams.get("outputMint") === USDC;
        return json({
          inputMint: url.searchParams.get("inputMint"),
          outputMint: url.searchParams.get("outputMint"),
          inAmount: url.searchParams.get("amount"),
          outAmount: isSell ? "9900000" : "100000",
          routePlan: [],
        });
      }
      if (url.pathname.endsWith("getTipAccounts")) {
        return json({ result: ["96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5"] });
      }
      if (url.hostname === "bundles.jito.wtf") {
        return json([{ time: "2026-08-28T00:00:00Z" }]);
      }
      throw new Error(`Unexpected metered request: ${url}`);
    }, () => collectTokenResearchInputs(MINT, {
      from: "2026-08-27T23:00:00Z",
      to: "2026-08-28T00:00:00Z",
      orderSizesUsd: [10],
      maxPages: 1,
    }));
    assert.equal(response.policy.meteredProvidersEnabled, false);
    assert.equal(response.providers.x.state, "skipped-disabled");
    assert.equal(response.providers.helius.state, "skipped-disabled");
    assert.equal(response.providers.solanaTracker.state, "skipped-disabled");
    assert.equal(hosts.includes("api.x.com"), false);
    assert.equal(hosts.includes("mainnet.helius-rpc.com"), false);
    assert.equal(hosts.includes("data.solanatracker.io"), false);
  } finally {
    restoreEnv("TOKEN_ENRICHMENT_METERED_ENABLED", environment.gate);
    restoreEnv("X_BEARER_TOKEN", environment.x);
    restoreEnv("HELIUS_API_KEY", environment.helius);
    restoreEnv("SOLANA_TRACKER_API_KEY", environment.tracker);
  }
});
