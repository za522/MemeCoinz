import type {
  CoinHistoryCoverage,
  CoinObservation,
} from "@/lib/coins/types";
import { asNumber, asString, getArray, getRecord, isRecord } from "@/lib/providers/http";
import { classifiedPumpInstruction, extractLaunchCandidates, parseRpcTransaction, parsedTokenTransfers, tokenBalanceOwnerDeltas } from "./pump-parser";
import { PUMP_AMM_PROGRAM_ID, PUMP_PROGRAM_ID } from "./pump-idl";
import {
  getRecentPrioritizationFeesRpc,
  getRpcContext,
  getSignatures,
  getTokenLargestAccounts,
  getTokenSupplyRpc,
  getTransactionsChunked,
} from "./solana-rpc";
import type { LaunchCandidate, ParsedTransaction } from "./types";

function instructionMint(
  programId: string,
  kind: ReturnType<typeof classifiedPumpInstruction>,
  accounts: string[],
): string | null {
  if (!kind) return null;
  if (
    programId === PUMP_AMM_PROGRAM_ID &&
    (kind === "buy" || kind === "sell" || kind === "pumpSwapBuyExactQuoteIn")
  ) {
    return accounts[3] ?? null;
  }
  if (programId !== PUMP_PROGRAM_ID) return null;
  if (kind === "create" || kind === "createV2") return accounts[0] ?? null;
  if (kind === "buy" || kind === "sell" || kind === "migrate") return accounts[2] ?? null;
  if (kind === "buyV2" || kind === "sellV2") return accounts[1] ?? null;
  return null;
}

function nativeBalanceChanges(transaction: ParsedTransaction) {
  if (!transaction.meta) return [];
  const pre = getArray(transaction.meta, "preBalances");
  const post = getArray(transaction.meta, "postBalances");
  return transaction.accountKeys.flatMap((account, index) => {
    const before = asNumber(pre[index]);
    const after = asNumber(post[index]);
    if (before === null || after === null || before === after) return [];
    return [{
      account: account.pubkey,
      signer: account.signer,
      preLamports: before,
      postLamports: after,
      deltaLamports: after - before,
    }];
  }).slice(0, 32);
}

export function transactionObservation(
  transaction: ParsedTransaction,
  mint: string,
  retrievedAt: string,
): CoinObservation | null {
  const relevantInstructions = transaction.instructions.flatMap((instruction) => {
    const kind = classifiedPumpInstruction(instruction);
    return instructionMint(instruction.programId, kind, instruction.accounts) === mint
      ? [{ kind, instruction }]
      : [];
  });
  const ownerDeltas = tokenBalanceOwnerDeltas(transaction, mint);
  const transfers = parsedTokenTransfers(transaction, mint);
  if (relevantInstructions.length === 0 && ownerDeltas.length === 0 && transfers.length === 0) {
    return null;
  }
  const kinds = [...new Set(relevantInstructions.map((entry) => entry.kind))];
  const tradeKind = kinds.some((kind) =>
    kind === "buy" || kind === "buyV2" || kind === "pumpSwapBuyExactQuoteIn"
  )
    ? "buy"
    : kinds.some((kind) => kind === "sell" || kind === "sellV2")
      ? "sell"
      : kinds.some((kind) => kind === "create" || kind === "createV2")
        ? "launch"
        : kinds.includes("migrate")
          ? "graduation"
          : transfers.length > 0
            ? "transfer"
            : "balance-change";
  const likelyWallet = ownerDeltas
    .filter((delta) => delta.owner)
    .sort((a, b) => {
      const direction = tradeKind === "sell" ? -1 : 1;
      return direction * ((b.uiDelta ?? 0) - (a.uiDelta ?? 0));
    })[0]?.owner ?? transaction.accountKeys.find((account) => account.signer)?.pubkey ?? null;
  const walletDelta = ownerDeltas.find((delta) => delta.owner === likelyWallet)
    ?? ownerDeltas[0]
    ?? null;
  const timestamp = transaction.blockTime === null
    ? null
    : new Date(transaction.blockTime * 1_000).toISOString();
  const eventAt = timestamp ?? retrievedAt;
  const availableAt = timestamp
    ? new Date(Date.parse(timestamp) + 2_000).toISOString()
    : retrievedAt;
  return {
    id: `${mint}:chain:${transaction.signature}`,
    mint,
    sourceId: "solana-rpc",
    observationType: "chain_transaction",
    eventAt,
    observedAt: retrievedAt,
    availableAt,
    retrievedAt,
    slot: transaction.slot || null,
    transactionIndex: transaction.transactionIndex,
    instructionIndex: relevantInstructions[0]?.instruction.instructionIndex ?? null,
    commitment: "confirmed",
    canonicalStatus: transaction.meta?.err == null ? "confirmed-success" : "confirmed-failed",
    fidelity: timestamp ? "canonical-reconstructed" : "canonical-confirmed",
    signature: transaction.signature,
    normalized: {
      kind: tradeKind,
      wallet: likelyWallet,
      tokenAmount: walletDelta?.uiDelta === null || walletDelta?.uiDelta === undefined
        ? null
        : Math.abs(walletDelta.uiDelta),
      tokenAmountRawDelta: walletDelta?.rawDelta ?? null,
      priceUsd: null,
      volumeUsd: null,
      networkAndPriorityFeeUsd: null,
      usdNormalizationMissingReason:
        "No as-of SOL/USD or executable quote observation is joined to this transaction; current prices are never backdated.",
      instructionKinds: kinds,
      tokenOwnerDeltas: ownerDeltas,
      nativeBalanceChanges: nativeBalanceChanges(transaction),
      transfers,
      feePayer: transaction.accountKeys[0]?.pubkey ?? null,
      feeLamports: transaction.meta ? asNumber(transaction.meta.fee) : null,
      computeUnitsConsumed: transaction.meta
        ? asNumber(transaction.meta.computeUnitsConsumed)
        : null,
      success: transaction.meta?.err == null,
      eventTimeSource: timestamp ? "block-time" : "retrieval-fallback",
      availabilityPolicy: timestamp
        ? "block-time-plus-2s-confirmation-assumption-v1"
        : "retrieval-time-only",
      availabilityAssumption:
        "Historical availability is reconstructed as block time plus two seconds. Actual RPC observation latency was not archived and may have been longer.",
      transactionIndexAvailable: false,
    },
    nullReason: timestamp
      ? null
      : "Solana RPC omitted blockTime; eventAt is a retrieval-time fallback and must not be used as a historical decision timestamp.",
  };
}

function currentRpcObservation(
  mint: string,
  observationType: string,
  normalized: Record<string, unknown>,
  retrievedAt: string,
  slot: number | null = null,
  nullReason: string | null = null,
): CoinObservation {
  return {
    id: `${mint}:${observationType}:${retrievedAt}`,
    mint,
    sourceId: "solana-rpc",
    observationType,
    eventAt: retrievedAt,
    observedAt: retrievedAt,
    availableAt: retrievedAt,
    retrievedAt,
    slot,
    transactionIndex: null,
    instructionIndex: null,
    commitment: "confirmed",
    canonicalStatus: "confirmed-current",
    fidelity: "canonical-confirmed",
    signature: null,
    normalized,
    nullReason,
  };
}

function normalizeSupply(value: unknown): { normalized: Record<string, unknown>; slot: number | null } | null {
  if (!isRecord(value)) return null;
  const context = getRecord(value, "context");
  const data = getRecord(value, "value");
  if (!data) return null;
  return {
    slot: context ? asNumber(context.slot) : null,
    normalized: {
      amount: asString(data.amount),
      decimals: asNumber(data.decimals),
      uiAmount: asNumber(data.uiAmount),
      uiAmountString: asString(data.uiAmountString),
    },
  };
}

function normalizeLargestAccounts(value: unknown): { normalized: Record<string, unknown>; slot: number | null } | null {
  if (!isRecord(value)) return null;
  const context = getRecord(value, "context");
  const accounts = getArray(value, "value").flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const address = asString(entry.address);
    if (!address) return [];
    return [{
      tokenAccount: address,
      amount: asString(entry.amount),
      decimals: asNumber(entry.decimals),
      uiAmount: asNumber(entry.uiAmount),
      uiAmountString: asString(entry.uiAmountString),
      owner: null,
    }];
  });
  return {
    slot: context ? asNumber(context.slot) : null,
    normalized: {
      accounts,
      ownerResolution: "unavailable",
      limitation: "getTokenLargestAccounts returns token accounts, not wallet owners. Concentration must not be calculated as independent holders until owners are resolved.",
    },
  };
}

function normalizePriorityFees(value: unknown): Record<string, unknown> | null {
  if (!Array.isArray(value)) return null;
  return {
    samples: value.flatMap((entry) => {
      if (!isRecord(entry)) return [];
      const slot = asNumber(entry.slot);
      const prioritizationFee = asNumber(entry.prioritizationFee);
      return slot === null || prioritizationFee === null
        ? []
        : [{ slot, prioritizationFeeLamports: prioritizationFee }];
    }),
    interpretation: "Recent fees for transactions locking the supplied writable account; this is a network-regime observation, not the exact fee paid by a historical trade.",
  };
}

export async function collectCoinHistory(
  mint: string,
  limit = 80,
  mode: "live" | "archive" = "live",
): Promise<{
  observations: CoinObservation[];
  launchCandidates: LaunchCandidate[];
  coverage: CoinHistoryCoverage;
}> {
  const context = getRpcContext(mode);
  if (!context) {
    return {
      observations: [],
      launchCandidates: [],
      coverage: {
        signaturesScanned: 0,
        transactionsDecoded: 0,
        oldestEventAt: null,
        newestEventAt: null,
        partial: true,
        missingReasons: [mode === "archive"
          ? "SOLANA_ARCHIVE_RPC_URL is not configured or invalid."
          : "SOLANA_RPC_URL is invalid."],
      },
    };
  }
  const boundedLimit = Math.min(200, Math.max(1, limit));
  const [signatureResult, currentResults] = await Promise.all([
    getSignatures(context, mint, { limit: boundedLimit }),
    mode === "live"
      ? Promise.all([
        getTokenSupplyRpc(context, mint),
        getTokenLargestAccounts(context, mint),
        getRecentPrioritizationFeesRpc(context, [mint]),
      ])
      : Promise.resolve(null),
  ]);
  const missingReasons: string[] = [];
  const retrievedAt = new Date().toISOString();
  const observations: CoinObservation[] = [];
  let parsedTransactions: ParsedTransaction[] = [];

  if (signatureResult.ok) {
    const transactions = await getTransactionsChunked(
      context,
      signatureResult.data.map((entry) => entry.signature),
    );
    parsedTransactions = transactions.transactions.flatMap((raw, index) => {
      if (!raw) return [];
      const parsed = parseRpcTransaction(
        raw,
        signatureResult.data[index]?.signature ?? "",
      );
      return parsed ? [parsed] : [];
    });
    observations.push(...parsedTransactions.flatMap((transaction) => {
      const observation = transactionObservation(transaction, mint, retrievedAt);
      return observation ? [observation] : [];
    }));
    if (transactions.partial) {
      missingReasons.push("Some recent mint transactions were unavailable or failed to decode.");
    }
  } else {
    missingReasons.push(`Recent mint signatures unavailable: ${signatureResult.code}.`);
  }

  const supplyResult = currentResults?.[0];
  if (supplyResult?.ok) {
    const supply = normalizeSupply(supplyResult.data);
    if (supply) observations.push(currentRpcObservation(
      mint,
      "token_supply",
      supply.normalized,
      supplyResult.checkedAt,
      supply.slot,
    ));
  } else if (mode === "live") {
    missingReasons.push(`Current token supply unavailable: ${supplyResult?.code ?? "not_configured"}.`);
  }

  const largestResult = currentResults?.[1];
  if (largestResult?.ok) {
    const largest = normalizeLargestAccounts(largestResult.data);
    if (largest) observations.push(currentRpcObservation(
      mint,
      "largest_token_accounts",
      largest.normalized,
      largestResult.checkedAt,
      largest.slot,
      "Wallet-owner resolution is not provided by this RPC method.",
    ));
  } else if (mode === "live") {
    missingReasons.push(`Largest token accounts unavailable: ${largestResult?.code ?? "not_configured"}.`);
  }

  const priorityResult = currentResults?.[2];
  if (priorityResult?.ok) {
    const priority = normalizePriorityFees(priorityResult.data);
    if (priority) observations.push(currentRpcObservation(
      mint,
      "priority_fee_regime",
      priority,
      priorityResult.checkedAt,
    ));
  } else if (mode === "live") {
    missingReasons.push(`Recent prioritization-fee regime unavailable: ${priorityResult?.code ?? "not_configured"}.`);
  }

  const launchCandidates = parsedTransactions.flatMap((transaction) =>
    extractLaunchCandidates(transaction, retrievedAt, "reconstructed")
      .filter((candidate) => candidate.mint === mint),
  );
  const timestamps = parsedTransactions.flatMap((transaction) =>
    transaction.blockTime === null
      ? []
      : [new Date(transaction.blockTime * 1_000).toISOString()],
  ).sort();
  return {
    observations,
    launchCandidates,
    coverage: {
      signaturesScanned: signatureResult.ok ? signatureResult.data.length : 0,
      transactionsDecoded: parsedTransactions.length,
      oldestEventAt: timestamps[0] ?? null,
      newestEventAt: timestamps.at(-1) ?? null,
      partial:
        !signatureResult.ok ||
        signatureResult.data.length === boundedLimit ||
        missingReasons.length > 0,
      missingReasons: [
        ...(signatureResult.ok && signatureResult.data.length === boundedLimit
          ? ["History is intentionally bounded; the oldest returned signature is a continuation point, not cohort completion."]
          : []),
        ...missingReasons,
        "Exact transaction index within a slot is unavailable from getTransaction; getBlock is required for slot-order reconstruction.",
      ],
    },
  };
}
