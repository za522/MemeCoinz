import assert from "node:assert/strict";
import test from "node:test";
import { loadBrowserDexFallback } from "../lib/ingestion/browser-fallback";

const PUMP_MINT = "Av2KSwkP4RH5zkUzDL51NyWmsLsEpGZ2GEW8CU8Vpump";
const WSOL_MINT = "So11111111111111111111111111111111111111112";

test("browser fallback returns real partial DEX rows without credentials or canonical claims", async () => {
  const requests: Array<{ input: string; init?: RequestInit }> = [];
  const fetcher = async (input: string, init?: RequestInit) => {
    requests.push({ input, init });
    if (input.endsWith("/token-profiles/latest/v1")) {
      return new Response(JSON.stringify([
        { chainId: "solana", tokenAddress: PUMP_MINT, icon: "https://cdn.example/pump.png" },
        { chainId: "solana", tokenAddress: WSOL_MINT, icon: null },
        { chainId: "ethereum", tokenAddress: "0x1234" },
      ]), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify([
      {
        chainId: "solana",
        dexId: "pumpswap",
        pairAddress: "pair-1",
        baseToken: { address: PUMP_MINT, name: "Real Pump", symbol: "REAL" },
        quoteToken: { address: WSOL_MINT, name: "Wrapped SOL", symbol: "SOL" },
        priceUsd: "0.000123",
        liquidity: { usd: 42000 },
        marketCap: 123000,
        volume: { h24: 31000 },
        txns: { h24: { buys: 90, sells: 41 } },
        priceChange: { h24: 12.5 },
        pairCreatedAt: 1_787_920_000_000,
      },
      {
        chainId: "solana",
        dexId: "raydium",
        pairAddress: "pair-2",
        baseToken: { address: WSOL_MINT, name: "Wrapped SOL", symbol: "SOL" },
        quoteToken: { address: PUMP_MINT, name: "Real Pump", symbol: "REAL" },
        priceUsd: "1",
      },
    ]), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  const result = await loadBrowserDexFallback({
    fetcher,
    limit: 20,
    now: () => new Date("2026-08-28T12:30:00.000Z"),
    serverWarnings: ["Server egress unavailable."],
  });

  assert.equal(result.coins.length, 1);
  assert.equal(result.coins[0].mint, PUMP_MINT);
  assert.equal(result.coins[0].name, "Real Pump");
  assert.equal(result.coins[0].market.priceUsd, 0.000123);
  assert.equal(result.coins[0].market.volume24hUsd, 31_000);
  assert.equal(result.coins[0].lifecycle.venue, "pump-swap");
  assert.equal(result.coins[0].canonicalConfirmed, false);
  assert.equal(result.coins[0].createdAt, null);
  assert.equal(result.ingestion.storage.state, "read-only");
  assert.match(result.ingestion.warnings.join(" "), /partial|promoted/i);
  assert.equal(requests.length, 2);
  for (const request of requests) {
    const headers = new Headers(request.init?.headers);
    assert.equal(headers.has("authorization"), false);
    assert.equal(request.init?.credentials, "omit");
  }
});

test("browser fallback fails closed when public profiles contain no valid Solana mint", async () => {
  const fetcher = async () => new Response(JSON.stringify([
    { chainId: "solana", tokenAddress: "not-a-mint" },
  ]), { status: 200, headers: { "Content-Type": "application/json" } });

  await assert.rejects(
    () => loadBrowserDexFallback({ fetcher }),
    /no valid Solana profiles/i,
  );
});
