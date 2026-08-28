import type { CoinListItem, CoinObservation } from "@/lib/coins/types";
import { decodeBase58 } from "./base58";

const SOURCE_IDS = new Set([
  "solana-rpc", "pump-onchain", "dex-screener", "jupiter", "helius",
  "solana-tracker", "x-api", "jito",
]);
const FIDELITIES = new Set([
  "canonical-finalized", "canonical-confirmed", "canonical-reconstructed",
  "indexed", "market-derived", "unavailable",
]);

const record = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const iso = (value: unknown): value is string =>
  typeof value === "string" && value.length <= 64 && Number.isFinite(Date.parse(value));
const nullableIso = (value: unknown): value is string | null => value === null || iso(value);
const nullableString = (value: unknown, maximum = 512): value is string | null =>
  value === null || (typeof value === "string" && value.length <= maximum);
const nullableFinite = (value: unknown): value is number | null =>
  value === null || (typeof value === "number" && Number.isFinite(value));
const nullableInteger = (value: unknown): value is number | null =>
  value === null || (Number.isSafeInteger(value) && (value as number) >= 0);
const mint = (value: unknown): value is string =>
  typeof value === "string" && decodeBase58(value)?.length === 32;

export function parseProtectedIngestionPayload(value: unknown): {
  coins: CoinListItem[];
  observations: CoinObservation[];
  error: string | null;
} {
  const failed = (error: string) => ({ coins: [], observations: [], error });
  if (!record(value)) return failed("Body must be one object.");
  if (!Array.isArray(value.coins) || value.coins.length < 1 || value.coins.length > 100) {
    return failed("coins must contain 1–100 records.");
  }
  if (!Array.isArray(value.observations) || value.observations.length > 5_000) {
    return failed("observations must contain 0–5,000 records.");
  }
  const coins: CoinListItem[] = [];
  const knownMints = new Set<string>();
  for (let index = 0; index < value.coins.length; index += 1) {
    const row = value.coins[index];
    if (!record(row) || !mint(row.mint) || knownMints.has(row.mint)) {
      return failed(`coins[${index}] has an invalid or duplicated mint.`);
    }
    if (!nullableString(row.name, 256) || !nullableString(row.symbol, 64) ||
      !nullableString(row.imageUri, 2_048) || !nullableString(row.metadataUri, 2_048) ||
      !nullableString(row.creator, 64) || !nullableIso(row.createdAt) ||
      !nullableInteger(row.createdSlot) || !nullableString(row.creationSignature, 128) ||
      typeof row.canonicalConfirmed !== "boolean" || !record(row.lifecycle) ||
      !record(row.market) || !Array.isArray(row.provenance) || !Array.isArray(row.missing)) {
      return failed(`coins[${index}] has an invalid core contract.`);
    }
    if (!["pump", "pump-swap", "unknown"].includes(String(row.lifecycle.venue)) ||
      !["bonding", "graduated", "pool", "unknown"].includes(String(row.lifecycle.stage)) ||
      !nullableIso(row.lifecycle.graduatedAt) || !nullableString(row.lifecycle.poolAddress, 64)) {
      return failed(`coins[${index}].lifecycle is invalid.`);
    }
    for (const field of ["priceUsd", "marketCapUsd", "liquidityUsd", "volume24hUsd", "buys24h", "sells24h", "priceChange24hPct"] as const) {
      if (!nullableFinite(row.market[field])) return failed(`coins[${index}].market.${field} is invalid.`);
    }
    if (!nullableString(row.market.pairAddress, 64) || !nullableString(row.market.dexId, 128) ||
      !nullableIso(row.market.pairCreatedAt) || !nullableIso(row.market.observedAt)) {
      return failed(`coins[${index}].market identity/timestamps are invalid.`);
    }
    if (row.provenance.length > 32 || row.missing.length > 64) {
      return failed(`coins[${index}] exceeds provenance/missing bounds.`);
    }
    for (const evidence of row.provenance) {
      if (!record(evidence) || !SOURCE_IDS.has(String(evidence.sourceId)) ||
        !FIDELITIES.has(String(evidence.fidelity)) || !nullableIso(evidence.eventAt) ||
        !iso(evidence.observedAt) || !iso(evidence.availableAt) || !iso(evidence.retrievedAt)) {
        return failed(`coins[${index}].provenance is invalid.`);
      }
    }
    knownMints.add(row.mint);
    coins.push(row as unknown as CoinListItem);
  }
  const observations: CoinObservation[] = [];
  const ids = new Set<string>();
  for (let index = 0; index < value.observations.length; index += 1) {
    const row = value.observations[index];
    if (!record(row) || typeof row.id !== "string" || row.id.length > 512 || ids.has(row.id) ||
      !knownMints.has(String(row.mint)) || !SOURCE_IDS.has(String(row.sourceId)) ||
      typeof row.observationType !== "string" || row.observationType.length > 128 ||
      !iso(row.eventAt) || !nullableIso(row.observedAt) || !nullableIso(row.availableAt) ||
      !iso(row.retrievedAt) || !nullableInteger(row.slot) ||
      !nullableInteger(row.transactionIndex) || !nullableInteger(row.instructionIndex) ||
      !nullableString(row.commitment, 64) || typeof row.canonicalStatus !== "string" ||
      row.canonicalStatus.length > 128 || !FIDELITIES.has(String(row.fidelity)) ||
      !nullableString(row.signature, 128) || !record(row.normalized) ||
      JSON.stringify(row.normalized).length > 32_768 || !nullableString(row.nullReason, 1_024)) {
      return failed(`observations[${index}] is invalid.`);
    }
    ids.add(row.id);
    observations.push(row as unknown as CoinObservation);
  }
  return { coins, observations, error: null };
}
