import { decodeBase58 } from "@/lib/ingestion/base58";
import {
  COHORT_IMPORT_BATCH_LIMIT,
  OBSERVED_STATUS,
} from "./constants";
import type { CohortImportRow } from "./types";

function finiteInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}
function optionalBoundedText(value: unknown, maximum: number): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string" || value.length > maximum) return undefined;
  return value;
}

export function isSolanaMint(value: unknown): value is string {
  if (typeof value !== "string" || value.length < 32 || value.length > 44) return false;
  return decodeBase58(value)?.length === 32;
}

export function parseCohortImportRows(value: unknown): {
  rows: CohortImportRow[];
  error: string | null;
} {
  if (!Array.isArray(value) || value.length < 1 || value.length > COHORT_IMPORT_BATCH_LIMIT) {
    return {
      rows: [],
      error: `rows must contain 1–${COHORT_IMPORT_BATCH_LIMIT} records.`,
    };
  }
  const rows: CohortImportRow[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const candidate = value[index];
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      return { rows: [], error: `rows[${index}] must be an object.` };
    }
    const row = candidate as Record<string, unknown>;
    if (!isSolanaMint(row.mint)) {
      return { rows: [], error: `rows[${index}].mint is not a 32-byte base58 address.` };
    }
    if (seen.has(row.mint)) {
      return { rows: [], error: `rows[${index}].mint is duplicated in this batch.` };
    }
    seen.add(row.mint);
    if (!finiteInteger(row.createdAtMs) || row.createdAtMs < 1_600_000_000_000) {
      return { rows: [], error: `rows[${index}].createdAtMs is invalid.` };
    }
    if (!finiteInteger(row.seenAtMs) || row.seenAtMs < row.createdAtMs) {
      return { rows: [], error: `rows[${index}].seenAtMs precedes creation.` };
    }
    const name = optionalBoundedText(row.name, 256);
    const symbol = optionalBoundedText(row.symbol, 64);
    if (name === undefined || symbol === undefined) {
      return { rows: [], error: `rows[${index}] has an invalid name or symbol.` };
    }
    if (
      row.initialMarketCapSol !== null &&
      (typeof row.initialMarketCapSol !== "number" ||
        !Number.isFinite(row.initialMarketCapSol) ||
        row.initialMarketCapSol < 0)
    ) {
      return { rows: [], error: `rows[${index}].initialMarketCapSol is invalid.` };
    }
    if (
      typeof row.hasX !== "boolean" ||
      typeof row.hasWebsite !== "boolean" ||
      typeof row.hasTelegram !== "boolean"
    ) {
      return { rows: [], error: `rows[${index}] social flags must be booleans.` };
    }
    if (!finiteInteger(row.descriptionLength) || row.descriptionLength < 0) {
      return { rows: [], error: `rows[${index}].descriptionLength is invalid.` };
    }
    if (!Object.values(OBSERVED_STATUS).includes(row.observedStatus as -1 | 0 | 1)) {
      return { rows: [], error: `rows[${index}].observedStatus is invalid.` };
    }
    const graduationAt = row.observedGraduationAtMs;
    const graduationMinutes = row.observedGraduationMinutes;
    if (row.observedStatus === OBSERVED_STATUS.confirmedFastGraduation) {
      if (!finiteInteger(graduationAt) || graduationAt < row.createdAtMs) {
        return { rows: [], error: `rows[${index}] confirmed graduation time is invalid.` };
      }
      if (typeof graduationMinutes !== "number" || !Number.isFinite(graduationMinutes) || graduationMinutes <= 0) {
        return { rows: [], error: `rows[${index}] confirmed graduation duration is invalid.` };
      }
    } else if (graduationAt !== null || graduationMinutes !== null) {
      return { rows: [], error: `rows[${index}] censored/unobserved rows cannot contain graduation values.` };
    }
    rows.push({
      mint: row.mint,
      createdAtMs: row.createdAtMs,
      seenAtMs: row.seenAtMs,
      name,
      symbol,
      initialMarketCapSol: row.initialMarketCapSol as number | null,
      hasX: row.hasX,
      hasWebsite: row.hasWebsite,
      hasTelegram: row.hasTelegram,
      descriptionLength: row.descriptionLength,
      observedStatus: row.observedStatus as -1 | 0 | 1,
      observedGraduationAtMs: graduationAt as number | null,
      observedGraduationMinutes: graduationMinutes as number | null,
    });
  }
  return { rows, error: null };
}
