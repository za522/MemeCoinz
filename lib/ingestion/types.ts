import type { CoinFidelity, CoinObservation, CoinProvenance } from "@/lib/coins/types";

export interface LaunchCandidate {
  mint: string;
  name: string | null;
  symbol: string | null;
  metadataUri: string | null;
  imageUri: string | null;
  creator: string | null;
  createdAt: string | null;
  createdSlot: number | null;
  creationSignature: string | null;
  programVersion: "create" | "create-v2" | "pump-swap-pool" | "indexed";
  venue: "pump" | "pump-swap" | "unknown";
  stage: "bonding" | "graduated" | "pool" | "unknown";
  graduatedAt: string | null;
  poolAddress: string | null;
  canonicalConfirmed: boolean;
  provenance: CoinProvenance[];
}

export interface NormalizedChainObservation extends CoinObservation {
  fidelity: CoinFidelity;
}

export interface SignatureInfo {
  signature: string;
  slot: number;
  blockTime: number | null;
  err: unknown;
  confirmationStatus: string | null;
}

export interface RpcInstruction {
  programId: string;
  accounts: string[];
  data: string | null;
  parsed: Record<string, unknown> | null;
  instructionIndex: number;
  inner: boolean;
}

export interface ParsedTransaction {
  signature: string;
  slot: number;
  blockTime: number | null;
  transactionIndex: number | null;
  accountKeys: Array<{ pubkey: string; signer: boolean }>;
  instructions: RpcInstruction[];
  meta: Record<string, unknown> | null;
  raw: Record<string, unknown>;
}
