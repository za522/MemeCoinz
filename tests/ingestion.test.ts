import assert from "node:assert/strict";
import test from "node:test";

import { encodeBase58 } from "../lib/ingestion/base58";
import { mergeLaunchCandidates } from "../lib/ingestion/discovery";
import { transactionObservation } from "../lib/ingestion/history";
import { decodePumpCreateData, parseRpcTransaction } from "../lib/ingestion/pump-parser";
import { PUMP_AMM_PROGRAM_ID, PUMP_DISCRIMINATORS } from "../lib/ingestion/pump-idl";
import { decodeCoinsCursor, encodeCoinsCursor, listCoins } from "../lib/ingestion/service";
import { storedAssetLaunchProvenance } from "../lib/ingestion/storage";
import type { LaunchCandidate } from "../lib/ingestion/types";

const MINT = "CSGoq89FbVgWcG6s91kQBQvn1Evvjm5P7x5q9HSDpump";
const CREATOR = "Fb8WmTgHy7FCNpQQTpiSZCNn8Wr1h79jkSJGSReGteUr";

function u32(value: number): number[] {
  return [value & 255, (value >> 8) & 255, (value >> 16) & 255, (value >> 24) & 255];
}

function borshString(value: string): number[] {
  const bytes = [...new TextEncoder().encode(value)];
  return [...u32(bytes.length), ...bytes];
}

function decodeAddressForFixture(value: string): number[] {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let number = BigInt(0);
  for (const character of value) {
    number = number * BigInt(58) + BigInt(alphabet.indexOf(character));
  }
  const bytes: number[] = [];
  while (number > BigInt(0)) {
    bytes.unshift(Number(number & BigInt(255)));
    number >>= BigInt(8);
  }
  return new Array<number>(32 - bytes.length).fill(0).concat(bytes);
}

test("official Pump Create data requires its exact discriminator", () => {
  const bytes = Uint8Array.from([
    ...PUMP_DISCRIMINATORS.create,
    ...borshString("Research Coin"),
    ...borshString("RSC"),
    ...borshString("https://example.invalid/meta.json"),
    ...decodeAddressForFixture(CREATOR),
  ]);
  assert.deepEqual(decodePumpCreateData(encodeBase58(bytes)), {
    kind: "create",
    name: "Research Coin",
    symbol: "RSC",
    uri: "https://example.invalid/meta.json",
    creator: CREATOR,
  });
  bytes[0] ^= 1;
  assert.equal(decodePumpCreateData(encodeBase58(bytes)), null);
});

test("candidate merge keeps canonical launch and later graduation", () => {
  const at = "2026-08-28T00:00:00.000Z";
  const base: LaunchCandidate = {
    mint: MINT,
    name: "Research Coin",
    symbol: "RSC",
    metadataUri: null,
    imageUri: null,
    creator: CREATOR,
    createdAt: at,
    createdSlot: 100,
    creationSignature: "create-signature",
    programVersion: "create",
    venue: "pump",
    stage: "bonding",
    graduatedAt: null,
    poolAddress: null,
    canonicalConfirmed: true,
    provenance: [{
      sourceId: "pump-onchain",
      role: "canonical-launch",
      fidelity: "canonical-confirmed",
      eventAt: at,
      observedAt: at,
      availableAt: at,
      retrievedAt: at,
      signature: "create-signature",
    }],
  };
  const merged = mergeLaunchCandidates([base, {
    ...base,
    name: null,
    symbol: null,
    createdAt: null,
    createdSlot: null,
    creationSignature: null,
    stage: "graduated",
    graduatedAt: "2026-08-28T01:00:00.000Z",
    poolAddress: "pool-address",
    provenance: [{
      ...base.provenance[0],
      role: "canonical-graduation",
      signature: "migration-signature",
    }],
  }]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].name, "Research Coin");
  assert.equal(merged[0].stage, "graduated");
  assert.equal(merged[0].poolAddress, "pool-address");
  assert.equal(merged[0].provenance.length, 2);
});

test("stored assets reconstruct a canonical launch only from complete create evidence", () => {
  const canonical = storedAssetLaunchProvenance({
    canonicalConfirmed: true,
    creationSignature: "create-signature",
    createdSlot: 42,
    createdAt: "2026-08-28T00:00:00.000Z",
    updatedAt: "2026-08-29T00:00:00.000Z",
  });
  assert.equal(canonical.role, "canonical-launch");
  assert.equal(canonical.fidelity, "canonical-reconstructed");
  assert.equal(canonical.availableAt, "2026-08-28T00:00:02.000Z");
  assert.equal(canonical.signature, "create-signature");
  assert.equal(canonical.slot, 42);

  const missingSlot = storedAssetLaunchProvenance({
    canonicalConfirmed: true,
    creationSignature: "vendor-or-incomplete-signature",
    createdSlot: null,
    createdAt: "2026-08-28T00:00:00.000Z",
    updatedAt: "2026-08-29T00:00:00.000Z",
  });
  assert.equal(missingSlot.role, "stored-observation");
  assert.equal(missingSlot.fidelity, "indexed");
  assert.equal(missingSlot.availableAt, "2026-08-29T00:00:00.000Z");

  const vendorOnly = storedAssetLaunchProvenance({
    canonicalConfirmed: false,
    creationSignature: null,
    createdSlot: null,
    createdAt: "2026-08-28T00:00:00.000Z",
    updatedAt: "2026-08-29T00:00:00.000Z",
  });
  assert.equal(vendorOnly.role, "stored-observation");
  assert.equal(vendorOnly.fidelity, "indexed");
});

test("PumpSwap buy uses official base-mint account and reconstructed availability", () => {
  const user = "9xQeWvG816bUx9EPjHmaT23yvVMZpE4Qn7yZ7C6mFgHQ";
  const raw = {
    slot: 42,
    blockTime: 1_700_000_000,
    transaction: {
      signatures: ["swap-signature"],
      message: {
        accountKeys: [
          { pubkey: user, signer: true },
          { pubkey: PUMP_AMM_PROGRAM_ID, signer: false },
          { pubkey: MINT, signer: false },
        ],
        instructions: [{
          programId: PUMP_AMM_PROGRAM_ID,
          accounts: ["pool", user, "global", MINT, "So11111111111111111111111111111111111111112"],
          data: encodeBase58(Uint8Array.from(PUMP_DISCRIMINATORS.buy)),
        }],
      },
    },
    meta: {
      err: null,
      fee: 5_000,
      preBalances: [1_000_000, 0, 0],
      postBalances: [995_000, 0, 0],
      preTokenBalances: [{
        accountIndex: 2,
        mint: MINT,
        owner: user,
        uiTokenAmount: { amount: "0", decimals: 6 },
      }],
      postTokenBalances: [{
        accountIndex: 2,
        mint: MINT,
        owner: user,
        uiTokenAmount: { amount: "1250000", decimals: 6 },
      }],
      innerInstructions: [],
    },
  };
  const transaction = parseRpcTransaction(raw, "swap-signature");
  assert.ok(transaction);
  const observation = transactionObservation(transaction, MINT, "2026-08-28T00:00:00.000Z");
  assert.ok(observation);
  assert.equal(observation.normalized.kind, "buy");
  assert.equal(observation.normalized.wallet, user);
  assert.equal(observation.fidelity, "canonical-reconstructed");
  assert.equal(observation.availableAt, "2023-11-14T22:13:22.000Z");
});

test("pagination cursors round-trip and malformed input is rejected", () => {
  const value = { rpcBefore: "sig-a", pumpSwapBefore: "sig-b", trackerPage: 2 };
  assert.deepEqual(decodeCoinsCursor(encodeCoinsCursor(value)), value);
  assert.equal(decodeCoinsCursor("not-base64-json"), null);
});

test("auto discovery returns real DEX fallback rows when canonical RPC page is empty", async () => {
  const originalFetch = globalThis.fetch;
  const originalTrackerKey = process.env.SOLANA_TRACKER_API_KEY;
  delete process.env.SOLANA_TRACKER_API_KEY;
  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.includes("api.mainnet.solana.com")) {
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
      assert.equal(body.method, "getSignaturesForAddress");
      return Response.json({ jsonrpc: "2.0", id: "memetrace", result: [] });
    }
    if (url.includes("/token-profiles/latest/v1")) {
      return Response.json([{
        chainId: "solana",
        tokenAddress: MINT,
        icon: "https://cdn.example/icon.png",
        description: "Profiled token",
        links: [],
      }]);
    }
    if (url.includes("/tokens/v1/solana/")) {
      return Response.json([{
        chainId: "solana",
        dexId: "pumpswap",
        pairAddress: "pool111111111111111111111111111111111111111",
        baseToken: { address: MINT, name: "Real Profile Coin", symbol: "RPC" },
        quoteToken: {
          address: "So11111111111111111111111111111111111111112",
          name: "Wrapped SOL",
          symbol: "SOL",
        },
        priceUsd: "0.0001",
        liquidity: { usd: 12_345 },
        marketCap: 90_000,
        pairCreatedAt: 1_700_000_000_000,
        volume: { h24: 5_000 },
        txns: { h24: { buys: 20, sells: 10 } },
        priceChange: { h24: 12 },
      }]);
    }
    if (url.includes("api.jup.ag")) {
      return Response.json({
        [MINT]: { usdPrice: 0.0001, decimals: 6, blockId: 123 },
      });
    }
    throw new Error(`Unexpected request ${url}`);
  };
  try {
    const response = await listCoins({ limit: 5, source: "auto" });
    assert.equal(response.coins.length, 1);
    assert.equal(response.coins[0].name, "Real Profile Coin");
    assert.equal(response.coins[0].symbol, "RPC");
    assert.equal(response.coins[0].canonicalConfirmed, false);
    assert.equal(response.coins[0].market.pairCreatedAt, "2023-11-14T22:13:20.000Z");
    assert.equal(
      response.coins[0].missing.some((field) => field.field === "name" || field.field === "symbol"),
      false,
    );
    assert.ok(response.ingestion.warnings.some((warning) => /partial|biased/i.test(warning)));
  } finally {
    globalThis.fetch = originalFetch;
    if (originalTrackerKey === undefined) delete process.env.SOLANA_TRACKER_API_KEY;
    else process.env.SOLANA_TRACKER_API_KEY = originalTrackerKey;
  }
});
