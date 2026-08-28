#!/usr/bin/env node
/**
 * Direct free-source collector for runtimes where the local Worker cannot make
 * outbound requests. Official decoders/providers run in this process; only
 * bounded normalized evidence is sent to the protected ingestion route.
 */

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { CoinListItem, CoinObservation, CoinsCursor } from "../lib/coins/types";
import { jupiterProbeObservations } from "../lib/collection";
import { mergeLaunchCandidates } from "../lib/ingestion/discovery";
import { collectCoinHistory } from "../lib/ingestion/history";
import { enrichCandidates } from "../lib/ingestion/market";
import { PUMP_PROGRAM_ID } from "../lib/ingestion/pump-idl";
import { extractLaunchCandidates, parseRpcTransaction } from "../lib/ingestion/pump-parser";
import { launchObservations } from "../lib/ingestion/service";
import { getRpcContext, getSignatures, rpcCall } from "../lib/ingestion/solana-rpc";
import type { LaunchCandidate } from "../lib/ingestion/types";
import { probeJupiterRoundTrips } from "../lib/providers/jupiter";

interface CollectorState {
  schemaVersion: 1;
  archiveCursor: CoinsCursor;
  runs: number;
  lastCompletedAt: string | null;
}

interface Options {
  baseUrl: string;
  mode: "live" | "archive" | "both";
  watch: boolean;
  intervalSeconds: number;
  stateFile: string;
}

function options(): Options {
  const values = process.argv.slice(2);
  const read = (name: string): string | null => {
    const index = values.indexOf(name);
    return index >= 0 ? values[index + 1] ?? null : null;
  };
  const mode = read("--mode") ?? "both";
  if (mode !== "live" && mode !== "archive" && mode !== "both") {
    throw new Error("--mode must be live, archive, or both");
  }
  const intervalSeconds = Number.parseInt(read("--interval-seconds") ?? "60", 10);
  if (!Number.isInteger(intervalSeconds) || intervalSeconds < 15) {
    throw new Error("--interval-seconds must be an integer of at least 15");
  }
  return {
    baseUrl: read("--base-url") ?? "http://127.0.0.1:3000",
    mode,
    watch: values.includes("--watch"),
    intervalSeconds,
    stateFile: resolve(read("--state-file") ?? ".research/free-direct-state.json"),
  };
}

async function readState(path: string): Promise<CollectorState> {
  try {
    const value: unknown = JSON.parse(await readFile(path, "utf8"));
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const row = value as Partial<CollectorState>;
      return {
        schemaVersion: 1,
        archiveCursor: row.archiveCursor ?? {},
        runs: Number.isInteger(row.runs) ? row.runs as number : 0,
        lastCompletedAt: typeof row.lastCompletedAt === "string" ? row.lastCompletedAt : null,
      };
    }
  } catch {
    // A missing/invalid checkpoint safely starts at the newest available page.
  }
  return { schemaVersion: 1, archiveCursor: {}, runs: 0, lastCompletedAt: null };
}

async function writeState(path: string, value: CollectorState): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, path);
}

function progressed(current: CoinsCursor, next: CoinsCursor): boolean {
  return next.rpcBefore !== current.rpcBefore || next.pumpSwapBefore !== current.pumpSwapBefore;
}

async function scan(
  mode: "live" | "archive",
  initialCursor: CoinsCursor,
): Promise<{ candidates: LaunchCandidate[]; nextCursor: CoinsCursor; warnings: string[] }> {
  const context = getRpcContext(mode);
  if (!context) {
    return { candidates: [], nextCursor: initialCursor, warnings: [`${mode} RPC is not configured.`] };
  }
  const warnings: string[] = [];
  const signatures = await getSignatures(context, PUMP_PROGRAM_ID, {
    before: initialCursor.rpcBefore,
    limit: 500,
  });
  if (!signatures.ok) {
    return {
      candidates: [],
      nextCursor: initialCursor,
      warnings: [`${mode} Pump signature request failed: ${signatures.code}.`],
    };
  }
  const retrievedAt = new Date().toISOString();
  const all: LaunchCandidate[] = [];
  const successful = signatures.data.filter((entry) => entry.err === null);
  for (const [index, signature] of successful.entries()) {
    let transaction: Record<string, unknown> | null = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const result = await rpcCall<Record<string, unknown> | null>(context, "getTransaction", [
        signature.signature,
        { commitment: "confirmed", encoding: "jsonParsed", maxSupportedTransactionVersion: 0 },
      ], 15_000);
      if (result.ok) {
        transaction = result.data;
        break;
      }
      if (result.code !== "rate_limited") {
        warnings.push(`Transaction ${signature.signature} was unavailable: ${result.code}.`);
        break;
      }
      await delay(500 * (attempt + 1));
    }
    if (transaction) {
      const parsed = parseRpcTransaction(transaction, signature.signature);
      if (parsed) {
        all.push(...extractLaunchCandidates(
          parsed,
          retrievedAt,
          mode === "archive" ? "reconstructed" : "observed",
        ));
      }
    }
    // Public Solana is documented at 40 calls/10s per RPC method. This pace
    // leaves headroom for retries and other local app probes.
    if (index < successful.length - 1) await delay(300);
  }
  const finalSignature = signatures.data.at(-1)?.signature;
  return {
    candidates: mergeLaunchCandidates(all),
    nextCursor: finalSignature ? { ...initialCursor, rpcBefore: finalSignature } : initialCursor,
    warnings: [...new Set(warnings)],
  };
}

async function postJson<T>(baseUrl: string, token: string, path: string, body: unknown): Promise<T> {
  const response = await fetch(new URL(path, baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-backfill-token": token },
    body: JSON.stringify(body),
  });
  const value = await response.json() as T & { message?: string; error?: string };
  if (!response.ok) throw new Error(value.message ?? value.error ?? `${path} returned ${response.status}`);
  return value;
}

async function storedCanonicalCoins(baseUrl: string): Promise<CoinListItem[]> {
  const url = new URL("/api/coins", baseUrl);
  url.searchParams.set("limit", "10");
  url.searchParams.set("source", "auto");
  url.searchParams.set("enrich", "false");
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`/api/coins returned ${response.status}`);
  const value: unknown = await response.json();
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const rows = (value as { coins?: unknown }).coins;
  if (!Array.isArray(rows)) return [];
  return rows.filter((row): row is CoinListItem => Boolean(
    row &&
    typeof row === "object" &&
    !Array.isArray(row) &&
    typeof (row as CoinListItem).mint === "string" &&
    (row as CoinListItem).canonicalConfirmed === true &&
    typeof (row as CoinListItem).createdAt === "string",
  ));
}

function storedCandidate(coin: CoinListItem): LaunchCandidate {
  return {
    mint: coin.mint,
    name: coin.name,
    symbol: coin.symbol,
    metadataUri: coin.metadataUri,
    imageUri: coin.imageUri,
    creator: coin.creator,
    createdAt: coin.createdAt,
    createdSlot: coin.createdSlot,
    creationSignature: coin.creationSignature,
    programVersion: coin.provenance.some((row) => row.role === "canonical-launch")
      ? "create"
      : "indexed",
    venue: coin.lifecycle.venue,
    stage: coin.lifecycle.stage,
    graduatedAt: coin.lifecycle.graduatedAt,
    poolAddress: coin.lifecycle.poolAddress,
    canonicalConfirmed: coin.canonicalConfirmed,
    provenance: coin.provenance,
  };
}

async function refreshStoredFreeResearch(baseUrl: string, token: string): Promise<{
  coinsAttempted: number;
  observationsSubmitted: number;
  warnings: string[];
}> {
  const coins = (await storedCanonicalCoins(baseUrl)).slice(0, 3);
  let observationsSubmitted = 0;
  const warnings: string[] = [];
  for (const [index, coin] of coins.entries()) {
    const enriched = await enrichCandidates([storedCandidate(coin)]);
    const quoteResult = await probeJupiterRoundTrips(coin.mint, {
      orderSizesUsd: [25, 100, 500],
      slippageBps: 100,
      allowMeteredCredential: false,
    });
    const quoteObservations = quoteResult.ok
      ? jupiterProbeObservations(quoteResult.data)
      : [];
    if (!quoteResult.ok) warnings.push(`${coin.mint}: Jupiter quotes failed (${quoteResult.code}).`);
    const observations = [...enriched.observations, ...quoteObservations];
    warnings.push(...enriched.warnings);
    await postJson(baseUrl, token, "/api/coins/ingest", {
      coins: enriched.coins,
      observations,
      warnings,
    });
    observationsSubmitted += observations.length;
    if (index < coins.length - 1) await delay(2_000);
  }
  return {
    coinsAttempted: coins.length,
    observationsSubmitted,
    warnings: [...new Set(warnings)],
  };
}

async function collectEvidence(candidates: LaunchCandidate[]): Promise<{
  coins: CoinListItem[];
  observations: CoinObservation[];
  warnings: string[];
}> {
  const canonical = candidates
    .filter((coin) => coin.canonicalConfirmed && coin.creationSignature && coin.createdAt)
    .slice(0, 25);
  if (!canonical.length) return { coins: [], observations: [], warnings: [] };
  const enriched = await enrichCandidates(canonical);
  const observations = [...launchObservations(canonical), ...enriched.observations];
  const warnings = [...enriched.warnings];
  for (const coin of canonical.slice(0, 10)) {
    const history = await collectCoinHistory(coin.mint, 200, "archive");
    observations.push(...history.observations);
    warnings.push(...history.coverage.missingReasons.map((reason) => `${coin.mint}: ${reason}`));
  }
  return {
    coins: enriched.coins,
    observations: observations.slice(0, 5_000),
    warnings: [...new Set(warnings)],
  };
}

async function oneRun(config: Options, state: CollectorState, token: string) {
  const startedAt = new Date().toISOString();
  const selected = new Map<string, LaunchCandidate>();
  const warnings: string[] = [];
  let archiveScanned = false;
  if (config.mode === "live" || config.mode === "both") {
    const live = await scan("live", {});
    live.candidates.forEach((coin) => selected.set(coin.mint, coin));
    warnings.push(...live.warnings);
  }
  if (config.mode === "archive" || config.mode === "both") {
    const archive = await scan("archive", state.archiveCursor);
    archive.candidates.forEach((coin) => selected.set(coin.mint, coin));
    warnings.push(...archive.warnings);
    if (progressed(state.archiveCursor, archive.nextCursor)) {
      state.archiveCursor = archive.nextCursor;
      archiveScanned = true;
    }
  }
  const evidence = await collectEvidence([...selected.values()]);
  let storage: unknown = { status: "nothing-to-write" };
  if (evidence.coins.length) {
    storage = await postJson(config.baseUrl, token, "/api/coins/ingest", evidence);
  }
  const freeResearch = await refreshStoredFreeResearch(config.baseUrl, token);
  // Run the free public research pass even when no new launch was decoded so
  // previously stored coins receive fresh size-specific quotes and Jito
  // context. Metered providers remain explicitly disabled.
  const pipeline: unknown = await postJson(config.baseUrl, token, "/api/pipeline/run", {
    maxCoins: 10,
    maxDiscoveryPages: 1,
    discoverySource: "auto",
    historyLimit: 200,
    collectAdvanced: true,
    allowMetered: false,
    orderSizesUsd: [25, 100, 500],
    horizonSeconds: 86_400,
    orderSizeUsd: 100,
    maxOutcomeSnapshots: 100,
    runTelegramAlerts: false,
  });
  state.runs += 1;
  state.lastCompletedAt = new Date().toISOString();
  await writeState(config.stateFile, state);
  return {
    startedAt,
    completedAt: state.lastCompletedAt,
    mode: config.mode,
    decodedCandidates: selected.size,
    canonicalCoinsWritten: evidence.coins.length,
    observationsSubmitted: evidence.observations.length,
    archiveScanned,
    warnings: [...new Set([...warnings, ...evidence.warnings, ...freeResearch.warnings])],
    storage,
    freeResearch,
    pipeline,
  };
}

async function main() {
  const config = options();
  const token = process.env.BACKFILL_ADMIN_TOKEN?.trim();
  if (!token) throw new Error("BACKFILL_ADMIN_TOKEN is required");
  const state = await readState(config.stateFile);
  do {
    try {
      const result = await oneRun(config, state, token);
      console.log(JSON.stringify(result));
    } catch (error) {
      console.error(JSON.stringify({ at: new Date().toISOString(), error: error instanceof Error ? error.message : "Collector failed." }));
      if (!config.watch) throw error;
    }
    if (config.watch) await delay(config.intervalSeconds * 1_000);
  } while (config.watch);
}

await main();
