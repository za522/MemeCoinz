import type {
  CoinsCursor,
  DiscoveryCoverage,
} from "@/lib/coins/types";
import {
  getLatestDexTokenProfiles,
  getLatestSolanaTrackerTokens,
} from "@/lib/providers";
import type { ProviderId } from "@/lib/providers/types";
import { extractLaunchCandidates, parseRpcTransaction } from "./pump-parser";
import { PUMP_AMM_PROGRAM_ID, PUMP_PROGRAM_ID } from "./pump-idl";
import {
  getRpcContext,
  getSignatures,
  getTransactionsChunked,
  type RpcContext,
} from "./solana-rpc";
import type { LaunchCandidate } from "./types";

export interface DiscoveryResult {
  candidates: LaunchCandidate[];
  coverage: DiscoveryCoverage[];
  nextCursor: CoinsCursor;
  sources: ProviderId[];
  warnings: string[];
}

function isoFromUnix(value: number | null): string | null {
  return value === null ? null : new Date(value * 1_000).toISOString();
}

function eventRange(candidates: LaunchCandidate[]): {
  newestEventAt: string | null;
  oldestEventAt: string | null;
} {
  const times = candidates.flatMap((candidate) =>
    candidate.createdAt || candidate.graduatedAt
      ? [candidate.createdAt ?? candidate.graduatedAt as string]
      : [],
  ).sort();
  return {
    oldestEventAt: times[0] ?? null,
    newestEventAt: times.at(-1) ?? null,
  };
}

async function scanProgram(
  context: RpcContext,
  programId: string,
  before: string | undefined,
  until: string | undefined,
  signatureLimit: number,
): Promise<{
  candidates: LaunchCandidate[];
  coverage: DiscoveryCoverage;
  nextBefore?: string;
}> {
  const signatures = await getSignatures(context, programId, {
    before,
    until,
    limit: signatureLimit,
  });
  if (!signatures.ok) {
    return {
      candidates: [],
      coverage: {
        sourceId: "pump-onchain",
        signaturesScanned: 0,
        transactionsRequested: 0,
        transactionsDecoded: 0,
        exactCreatesFound: 0,
        exactMigrationsFound: 0,
        newestEventAt: null,
        oldestEventAt: null,
        partial: true,
        errorCode: signatures.code,
        missingReason: `${context.mode} RPC could not list ${programId === PUMP_PROGRAM_ID ? "Pump" : "PumpSwap"} signatures.`,
      },
    };
  }

  const successful = signatures.data.filter((entry) => entry.err === null);
  const transactionResult = await getTransactionsChunked(
    context,
    successful.map((entry) => entry.signature),
  );
  const retrievedAt = new Date().toISOString();
  const parsed = transactionResult.transactions.flatMap((raw, index) => {
    if (!raw) return [];
    const transaction = parseRpcTransaction(raw, successful[index]?.signature ?? "");
    return transaction ? [transaction] : [];
  });
  const candidates = parsed.flatMap((transaction) =>
    extractLaunchCandidates(
      transaction,
      retrievedAt,
      context.mode === "archive" ? "reconstructed" : "observed",
    ),
  );
  const exactCreatesFound = candidates.filter((candidate) =>
    candidate.creationSignature !== null,
  ).length;
  const exactMigrationsFound = candidates.filter((candidate) =>
    candidate.graduatedAt !== null,
  ).length;
  const range = eventRange(candidates);
  const pageBounded = signatures.data.length === signatureLimit;
  return {
    candidates,
    coverage: {
      sourceId: "pump-onchain",
      signaturesScanned: signatures.data.length,
      transactionsRequested: successful.length,
      transactionsDecoded: parsed.length,
      exactCreatesFound,
      exactMigrationsFound,
      ...range,
      partial: pageBounded || transactionResult.partial,
      ...(transactionResult.errorCode
        ? { errorCode: transactionResult.errorCode }
        : {}),
      ...(pageBounded || transactionResult.partial
        ? {
            missingReason: [
              ...(pageBounded
                ? ["The request intentionally scanned one bounded signature page; use the returned cursor or archive backfill for older launches."]
                : []),
              ...(transactionResult.partial
                ? ["Some transactions were unavailable or failed to decode, commonly because of public-RPC rate limits."]
                : []),
            ].join(" "),
          }
        : {}),
    },
    ...(signatures.data.at(-1)?.signature
      ? { nextBefore: signatures.data.at(-1)?.signature }
      : {}),
  };
}

function mergeOne(existing: LaunchCandidate, incoming: LaunchCandidate): LaunchCandidate {
  const stageRank = { unknown: 0, bonding: 1, pool: 2, graduated: 3 } as const;
  const incomingIsCreate = incoming.creationSignature !== null;
  const existingIsCreate = existing.creationSignature !== null;
  const primary = incomingIsCreate && !existingIsCreate ? incoming : existing;
  const other = primary === existing ? incoming : existing;
  const provenance = [...primary.provenance];
  for (const item of other.provenance) {
    const duplicate = provenance.some((candidate) =>
      candidate.sourceId === item.sourceId &&
      candidate.role === item.role &&
      candidate.signature === item.signature,
    );
    if (!duplicate) provenance.push(item);
  }
  const stage = stageRank[incoming.stage] > stageRank[existing.stage]
    ? incoming.stage
    : existing.stage;
  return {
    ...primary,
    name: primary.name ?? other.name,
    symbol: primary.symbol ?? other.symbol,
    metadataUri: primary.metadataUri ?? other.metadataUri,
    imageUri: primary.imageUri ?? other.imageUri,
    creator: primary.creator ?? other.creator,
    createdAt: primary.createdAt ?? other.createdAt,
    createdSlot: primary.createdSlot ?? other.createdSlot,
    creationSignature: primary.creationSignature ?? other.creationSignature,
    venue: existing.venue === "pump" || incoming.venue === "pump"
      ? "pump"
      : primary.venue,
    stage,
    graduatedAt: incoming.graduatedAt ?? existing.graduatedAt,
    poolAddress: incoming.poolAddress ?? existing.poolAddress,
    canonicalConfirmed: existing.canonicalConfirmed || incoming.canonicalConfirmed,
    provenance,
  };
}

export function mergeLaunchCandidates(
  candidates: LaunchCandidate[],
): LaunchCandidate[] {
  const merged = new Map<string, LaunchCandidate>();
  for (const candidate of candidates) {
    const existing = merged.get(candidate.mint);
    merged.set(candidate.mint, existing ? mergeOne(existing, candidate) : candidate);
  }
  return [...merged.values()].sort((a, b) => {
    const aTime = a.createdAt ?? a.graduatedAt ?? "";
    const bTime = b.createdAt ?? b.graduatedAt ?? "";
    return bTime.localeCompare(aTime);
  });
}

export async function discoverFromRpc(options: {
  mode?: "live" | "archive";
  cursor?: CoinsCursor;
  until?: string;
  signatureLimit?: number;
} = {}): Promise<DiscoveryResult> {
  const mode = options.mode ?? "live";
  const context = getRpcContext(mode);
  if (!context) {
    return {
      candidates: [],
      coverage: [{
        sourceId: "pump-onchain",
        signaturesScanned: 0,
        transactionsRequested: 0,
        transactionsDecoded: 0,
        exactCreatesFound: 0,
        exactMigrationsFound: 0,
        newestEventAt: null,
        oldestEventAt: null,
        partial: true,
        errorCode: "not_configured",
        missingReason: mode === "archive"
          ? "SOLANA_ARCHIVE_RPC_URL is not configured."
          : "SOLANA_RPC_URL is invalid.",
      }],
      nextCursor: {},
      sources: ["pump-onchain"],
      warnings: [mode === "archive"
        ? "Historical backfill requires an archive-capable RPC endpoint."
        : "Canonical Solana launch discovery is unavailable."],
    };
  }

  const signatureLimit = Math.min(500, Math.max(20, options.signatureLimit ?? 120));
  const [pump, pumpSwap] = await Promise.all([
    scanProgram(
      context,
      PUMP_PROGRAM_ID,
      options.cursor?.rpcBefore,
      options.until,
      signatureLimit,
    ),
    scanProgram(
      context,
      PUMP_AMM_PROGRAM_ID,
      options.cursor?.pumpSwapBefore,
      options.until,
      Math.min(signatureLimit, 80),
    ),
  ]);
  return {
    candidates: mergeLaunchCandidates([...pump.candidates, ...pumpSwap.candidates]),
    coverage: [pump.coverage, pumpSwap.coverage],
    nextCursor: {
      ...(pump.nextBefore ? { rpcBefore: pump.nextBefore } : {}),
      ...(pumpSwap.nextBefore ? { pumpSwapBefore: pumpSwap.nextBefore } : {}),
    },
    sources: ["pump-onchain"],
    warnings: [
      ...(pump.coverage.partial ? [pump.coverage.missingReason ?? "Pump scan is partial."] : []),
      ...(pumpSwap.coverage.partial ? [pumpSwap.coverage.missingReason ?? "PumpSwap scan is partial."] : []),
    ],
  };
}

export async function discoverFromSolanaTracker(page = 1): Promise<DiscoveryResult> {
  const result = await getLatestSolanaTrackerTokens(page);
  if (!result.ok) {
    return {
      candidates: [],
      coverage: [{
        sourceId: "solana-tracker",
        signaturesScanned: 0,
        transactionsRequested: 0,
        transactionsDecoded: 0,
        exactCreatesFound: 0,
        exactMigrationsFound: 0,
        newestEventAt: null,
        oldestEventAt: null,
        partial: true,
        errorCode: result.code,
        missingReason: result.code === "not_configured"
          ? "SOLANA_TRACKER_API_KEY is not configured."
          : "Solana Tracker latest-token request failed.",
      }],
      nextCursor: {},
      sources: ["solana-tracker"],
      warnings: ["Solana Tracker acceleration is unavailable; it is not used as canonical confirmation."],
    };
  }
  const retrievedAt = result.checkedAt;
  const candidates: LaunchCandidate[] = result.data.flatMap((token) => {
    const pumpLike =
      token.createdOn?.toLowerCase().includes("pump.fun") ||
      token.latestPoolMarket?.toLowerCase().includes("pump");
    if (!pumpLike) return [];
    const createdAt = isoFromUnix(token.createdAtUnix);
    const graduated = token.latestPoolMarket?.toLowerCase().includes("pumpswap") ?? false;
    return [{
      mint: token.mint,
      name: token.name,
      symbol: token.symbol,
      metadataUri: token.metadataUri,
      imageUri: token.image,
      creator: token.creator,
      createdAt,
      createdSlot: null,
      creationSignature: token.createdTransaction,
      programVersion: "indexed" as const,
      venue: "pump" as const,
      stage: graduated ? "graduated" as const : "bonding" as const,
      graduatedAt: null,
      poolAddress: token.pools[0]?.poolAddress ?? null,
      canonicalConfirmed: false,
      provenance: [{
        sourceId: "solana-tracker" as const,
        role: "accelerated-discovery" as const,
        fidelity: "indexed" as const,
        eventAt: createdAt,
        observedAt: retrievedAt,
        availableAt: retrievedAt,
        retrievedAt,
        ...(token.createdTransaction ? { signature: token.createdTransaction } : {}),
        missingReason: "Vendor-indexed discovery is accelerated but not canonical confirmation until matched to an official Pump instruction.",
      }],
    }];
  });
  const range = eventRange(candidates);
  return {
    candidates,
    coverage: [{
      sourceId: "solana-tracker",
      signaturesScanned: 0,
      transactionsRequested: 0,
      transactionsDecoded: 0,
      exactCreatesFound: candidates.length,
      exactMigrationsFound: candidates.filter((candidate) => candidate.stage === "graduated").length,
      ...range,
      partial: true,
      missingReason: "Solana Tracker returns a bounded vendor latest-token page, not a complete canonical cohort.",
    }],
    nextCursor: { trackerPage: Math.min(10, page + 1) },
    sources: ["solana-tracker"],
    warnings: ["Solana Tracker is an accelerator. Rows remain indexed until an official on-chain create instruction confirms them."],
  };
}

export async function discoverFromDexProfiles(): Promise<DiscoveryResult> {
  const result = await getLatestDexTokenProfiles();
  if (!result.ok) {
    return {
      candidates: [],
      coverage: [{
        sourceId: "dex-screener",
        signaturesScanned: 0,
        transactionsRequested: 0,
        transactionsDecoded: 0,
        exactCreatesFound: 0,
        exactMigrationsFound: 0,
        newestEventAt: null,
        oldestEventAt: null,
        partial: true,
        errorCode: result.code,
        missingReason: "DEX Screener latest profiles were unavailable.",
      }],
      nextCursor: {},
      sources: ["dex-screener"],
      warnings: ["The partial DEX profile fallback is unavailable."],
    };
  }
  const candidates: LaunchCandidate[] = result.data
    .filter((profile) => profile.chainId === "solana")
    .map((profile) => ({
      mint: profile.tokenAddress,
      name: null,
      symbol: null,
      metadataUri: null,
      imageUri: profile.icon,
      creator: null,
      createdAt: null,
      createdSlot: null,
      creationSignature: null,
      programVersion: "indexed",
      venue: "unknown",
      stage: "unknown",
      graduatedAt: null,
      poolAddress: null,
      canonicalConfirmed: false,
      provenance: [{
        sourceId: "dex-screener",
        role: "paid-profile-discovery",
        fidelity: "market-derived",
        eventAt: null,
        observedAt: result.checkedAt,
        availableAt: result.checkedAt,
        retrievedAt: result.checkedAt,
        missingReason: "Latest profiles are promoted/profiled tokens, not a complete or unbiased launch feed.",
      }],
    }));
  return {
    candidates,
    coverage: [{
      sourceId: "dex-screener",
      signaturesScanned: 0,
      transactionsRequested: 0,
      transactionsDecoded: 0,
      exactCreatesFound: 0,
      exactMigrationsFound: 0,
      newestEventAt: null,
      oldestEventAt: null,
      partial: true,
      missingReason: "DEX Screener latest profiles are a bounded promoted/profile subset with no canonical creation time.",
    }],
    nextCursor: {},
    sources: ["dex-screener"],
    warnings: ["DEX Screener profile discovery is visibly partial and biased; it must not be used as the training cohort."],
  };
}
