import { asNumber, asString, getArray, getRecord, isRecord } from "@/lib/providers/http";
import { decodeBase58, encodeBase58 } from "./base58";
import {
  instructionKind,
  PUMP_AMM_PROGRAM_ID,
  PUMP_PROGRAM_ID,
  WRAPPED_SOL_MINT,
  type PumpInstructionKind,
} from "./pump-idl";
import type {
  LaunchCandidate,
  ParsedTransaction,
  RpcInstruction,
} from "./types";

function accountKey(value: unknown): { pubkey: string; signer: boolean } | null {
  if (typeof value === "string") return { pubkey: value, signer: false };
  if (!isRecord(value)) return null;
  const pubkey = asString(value.pubkey);
  if (!pubkey) return null;
  return { pubkey, signer: value.signer === true };
}

function resolveAddress(value: unknown, keys: string[]): string | null {
  if (typeof value === "string") return value;
  return typeof value === "number" ? keys[value] ?? null : null;
}

function normalizeInstruction(
  value: unknown,
  keys: string[],
  instructionIndex: number,
  inner: boolean,
): RpcInstruction | null {
  if (!isRecord(value)) return null;
  const programId =
    asString(value.programId) ?? resolveAddress(value.programIdIndex, keys);
  if (!programId) return null;
  const accounts = Array.isArray(value.accounts)
    ? value.accounts.flatMap((entry) => {
        const address = resolveAddress(entry, keys);
        return address ? [address] : [];
      })
    : [];
  return {
    programId,
    accounts,
    data: asString(value.data),
    parsed: getRecord(value, "parsed"),
    instructionIndex,
    inner,
  };
}

export function parseRpcTransaction(
  raw: Record<string, unknown>,
  signatureHint: string,
): ParsedTransaction | null {
  const transaction = getRecord(raw, "transaction");
  const message = transaction ? getRecord(transaction, "message") : null;
  if (!transaction || !message) return null;

  const accountKeys = getArray(message, "accountKeys").flatMap((entry) => {
    const normalized = accountKey(entry);
    return normalized ? [normalized] : [];
  });
  const keyStrings = accountKeys.map((entry) => entry.pubkey);
  const signatures = getArray(transaction, "signatures").flatMap((entry) =>
    typeof entry === "string" ? [entry] : [],
  );
  const instructions = getArray(message, "instructions").flatMap((entry, index) => {
    const normalized = normalizeInstruction(entry, keyStrings, index, false);
    return normalized ? [normalized] : [];
  });

  const meta = getRecord(raw, "meta");
  if (meta) {
    for (const group of getArray(meta, "innerInstructions")) {
      if (!isRecord(group)) continue;
      const parentIndex = asNumber(group.index) ?? 0;
      for (const [innerIndex, entry] of getArray(group, "instructions").entries()) {
        const normalized = normalizeInstruction(
          entry,
          keyStrings,
          parentIndex * 1_000 + innerIndex,
          true,
        );
        if (normalized) instructions.push(normalized);
      }
    }
  }

  return {
    signature: signatures[0] ?? signatureHint,
    slot: asNumber(raw.slot) ?? 0,
    blockTime: asNumber(raw.blockTime),
    transactionIndex: null,
    accountKeys,
    instructions,
    meta,
    raw,
  };
}

function readU32(bytes: Uint8Array, offset: number): number | null {
  if (offset + 4 > bytes.length) return null;
  return (
    bytes[offset] |
    (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16) |
    (bytes[offset + 3] << 24)
  ) >>> 0;
}

function readString(
  bytes: Uint8Array,
  offset: number,
): { value: string; offset: number } | null {
  const length = readU32(bytes, offset);
  if (length === null || length > 1_024 || offset + 4 + length > bytes.length) {
    return null;
  }
  try {
    return {
      value: new TextDecoder("utf-8", { fatal: true }).decode(
        bytes.slice(offset + 4, offset + 4 + length),
      ),
      offset: offset + 4 + length,
    };
  } catch {
    return null;
  }
}

export function decodePumpCreateData(data: string): {
  kind: "create" | "createV2";
  name: string;
  symbol: string;
  uri: string;
  creator: string;
} | null {
  const bytes = decodeBase58(data);
  if (!bytes) return null;
  const kind = instructionKind(bytes);
  if (kind !== "create" && kind !== "createV2") return null;
  let offset = 8;
  const name = readString(bytes, offset);
  if (!name) return null;
  offset = name.offset;
  const symbol = readString(bytes, offset);
  if (!symbol) return null;
  offset = symbol.offset;
  const uri = readString(bytes, offset);
  if (!uri) return null;
  offset = uri.offset;
  if (offset + 32 > bytes.length) return null;
  return {
    kind,
    name: name.value,
    symbol: symbol.value,
    uri: uri.value,
    creator: encodeBase58(bytes.slice(offset, offset + 32)),
  };
}

export function classifiedPumpInstruction(
  instruction: RpcInstruction,
): PumpInstructionKind | null {
  if (!instruction.data) return null;
  const bytes = decodeBase58(instruction.data);
  return bytes ? instructionKind(bytes) : null;
}

function eventAt(transaction: ParsedTransaction): string | null {
  return transaction.blockTime === null
    ? null
    : new Date(transaction.blockTime * 1_000).toISOString();
}

export function extractLaunchCandidates(
  transaction: ParsedTransaction,
  retrievedAt: string,
  availabilityMode: "observed" | "reconstructed" = "observed",
): LaunchCandidate[] {
  const reconstructedAvailableAt = transaction.blockTime === null
    ? retrievedAt
    : new Date(transaction.blockTime * 1_000 + 2_000).toISOString();
  const availableAt = availabilityMode === "reconstructed"
    ? reconstructedAvailableAt
    : retrievedAt;
  const canonicalFidelity = availabilityMode === "reconstructed"
    ? "canonical-reconstructed" as const
    : "canonical-confirmed" as const;
  const candidates: LaunchCandidate[] = [];
  for (const instruction of transaction.instructions) {
    const kind = classifiedPumpInstruction(instruction);
    if (instruction.programId === PUMP_PROGRAM_ID && (kind === "create" || kind === "createV2")) {
      const mint = instruction.accounts[0];
      if (!mint) continue;
      const decoded = instruction.data
        ? decodePumpCreateData(instruction.data)
        : null;
      const timestamp = eventAt(transaction);
      candidates.push({
        mint,
        name: decoded?.name ?? null,
        symbol: decoded?.symbol ?? null,
        metadataUri: decoded?.uri ?? null,
        imageUri: null,
        creator: decoded?.creator ?? null,
        createdAt: timestamp,
        createdSlot: transaction.slot || null,
        creationSignature: transaction.signature,
        programVersion: kind === "createV2" ? "create-v2" : "create",
        venue: "pump",
        stage: "bonding",
        graduatedAt: null,
        poolAddress: null,
        canonicalConfirmed: true,
        provenance: [{
          sourceId: "pump-onchain",
          role: "canonical-launch",
          fidelity: canonicalFidelity,
          eventAt: timestamp,
          observedAt: retrievedAt,
          availableAt,
          retrievedAt,
          signature: transaction.signature,
          ...(transaction.slot ? { slot: transaction.slot } : {}),
          ...(timestamp ? {} : { missingReason: "Solana RPC returned no block time." }),
        }],
      });
      continue;
    }

    if (instruction.programId === PUMP_PROGRAM_ID && kind === "migrate") {
      const mint = instruction.accounts[2];
      if (!mint) continue;
      const timestamp = eventAt(transaction);
      candidates.push({
        mint,
        name: null,
        symbol: null,
        metadataUri: null,
        imageUri: null,
        creator: null,
        createdAt: null,
        createdSlot: null,
        creationSignature: null,
        programVersion: "create",
        venue: "pump",
        stage: "graduated",
        graduatedAt: timestamp,
        poolAddress: null,
        canonicalConfirmed: true,
        provenance: [{
          sourceId: "pump-onchain",
          role: "canonical-graduation",
          fidelity: canonicalFidelity,
          eventAt: timestamp,
          observedAt: retrievedAt,
          availableAt,
          retrievedAt,
          signature: transaction.signature,
          ...(transaction.slot ? { slot: transaction.slot } : {}),
        }],
      });
      continue;
    }

    if (instruction.programId === PUMP_AMM_PROGRAM_ID && kind === "createPool") {
      const baseMint = instruction.accounts[3];
      const quoteMint = instruction.accounts[4];
      const mint =
        baseMint === WRAPPED_SOL_MINT
          ? quoteMint
          : quoteMint === WRAPPED_SOL_MINT
            ? baseMint
            : null;
      if (!mint) continue;
      const timestamp = eventAt(transaction);
      candidates.push({
        mint,
        name: null,
        symbol: null,
        metadataUri: null,
        imageUri: null,
        creator: instruction.accounts[2] ?? null,
        createdAt: null,
        createdSlot: null,
        creationSignature: null,
        programVersion: "pump-swap-pool",
        venue: "pump-swap",
        stage: "pool",
        graduatedAt: timestamp,
        poolAddress: instruction.accounts[0] ?? null,
        canonicalConfirmed: true,
        provenance: [{
          sourceId: "pump-onchain",
          role: "canonical-graduation",
          fidelity: canonicalFidelity,
          eventAt: timestamp,
          observedAt: retrievedAt,
          availableAt,
          retrievedAt,
          signature: transaction.signature,
          ...(transaction.slot ? { slot: transaction.slot } : {}),
        }],
      });
    }
  }
  return candidates;
}

export function tokenBalanceOwnerDeltas(
  transaction: ParsedTransaction,
  mint: string,
): Array<{
  owner: string | null;
  account: string | null;
  rawDelta: string;
  uiDelta: number | null;
  decimals: number | null;
}> {
  const pre = transaction.meta ? getArray(transaction.meta, "preTokenBalances") : [];
  const post = transaction.meta ? getArray(transaction.meta, "postTokenBalances") : [];
  const entries = new Map<string, { owner: string | null; account: string | null; pre: bigint; post: bigint; decimals: number | null }>();

  const apply = (values: unknown[], side: "pre" | "post") => {
    for (const value of values) {
      if (!isRecord(value) || asString(value.mint) !== mint) continue;
      const accountIndex = asNumber(value.accountIndex);
      const owner = asString(value.owner);
      const amountRecord = getRecord(value, "uiTokenAmount");
      const amount = amountRecord ? asString(amountRecord.amount) : null;
      if (accountIndex === null || amount === null || !/^\d+$/.test(amount)) continue;
      const key = `${accountIndex}:${owner ?? ""}`;
      const current = entries.get(key) ?? {
        owner,
        account: transaction.accountKeys[accountIndex]?.pubkey ?? null,
        pre: BigInt(0),
        post: BigInt(0),
        decimals: amountRecord ? asNumber(amountRecord.decimals) : null,
      };
      current[side] = BigInt(amount);
      entries.set(key, current);
    }
  };
  apply(pre, "pre");
  apply(post, "post");

  return [...entries.values()].flatMap((entry) => {
    const rawDelta = entry.post - entry.pre;
    if (rawDelta === BigInt(0)) return [];
    const divisor = entry.decimals === null ? null : 10 ** entry.decimals;
    return [{
      owner: entry.owner,
      account: entry.account,
      rawDelta: rawDelta.toString(),
      uiDelta: divisor ? Number(rawDelta) / divisor : null,
      decimals: entry.decimals,
    }];
  });
}

export function parsedTokenTransfers(
  transaction: ParsedTransaction,
  mint: string,
): Array<Record<string, unknown>> {
  const tokenAccounts = new Set<string>();
  if (transaction.meta) {
    for (const side of ["preTokenBalances", "postTokenBalances"] as const) {
      for (const value of getArray(transaction.meta, side)) {
        if (!isRecord(value) || asString(value.mint) !== mint) continue;
        const index = asNumber(value.accountIndex);
        if (index !== null && transaction.accountKeys[index]) {
          tokenAccounts.add(transaction.accountKeys[index].pubkey);
        }
      }
    }
  }
  return transaction.instructions.flatMap((instruction) => {
    if (!instruction.parsed) return [];
    const type = asString(instruction.parsed.type);
    if (type !== "transfer" && type !== "transferChecked") return [];
    const info = getRecord(instruction.parsed, "info");
    if (!info) return [];
    const source = asString(info.source);
    const destination = asString(info.destination);
    const parsedMint = asString(info.mint);
    if (
      parsedMint !== mint &&
      !tokenAccounts.has(source ?? "") &&
      !tokenAccounts.has(destination ?? "")
    ) {
      return [];
    }
    const tokenAmount = getRecord(info, "tokenAmount");
    return [{
      type,
      sourceTokenAccount: source,
      destinationTokenAccount: destination,
      authority: asString(info.authority),
      rawAmount: asString(info.amount) ?? (tokenAmount ? asString(tokenAmount.amount) : null),
      decimals: tokenAmount ? asNumber(tokenAmount.decimals) : null,
      instructionIndex: instruction.instructionIndex,
      inner: instruction.inner,
    }];
  });
}
