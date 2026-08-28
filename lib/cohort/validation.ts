import { decodeBase58 } from "@/lib/ingestion/base58";
import {
  COHORT_IMPORT_BATCH_LIMIT,
  OBSERVED_STATUS,
} from "./constants";
import type {
  CohortFeatureAggregateImportRow,
  CohortFeatureImportRow,
  CohortImportRow,
} from "./types";

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

const boundedNumber = (value: unknown, minimum: number, maximum: number): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum;

export function parseCohortFeatureRows(value: unknown): {
  rows: CohortFeatureImportRow[];
  error: string | null;
} {
  if (!Array.isArray(value) || value.length < 1 || value.length > COHORT_IMPORT_BATCH_LIMIT) {
    return { rows: [], error: `rows must contain 1–${COHORT_IMPORT_BATCH_LIMIT} records.` };
  }
  const rows: CohortFeatureImportRow[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const candidate = value[index];
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      return { rows: [], error: `rows[${index}] must be an object.` };
    }
    const row = candidate as Record<string, unknown>;
    if (!isSolanaMint(row.mint) || seen.has(row.mint)) {
      return { rows: [], error: `rows[${index}].mint is invalid or duplicated.` };
    }
    seen.add(row.mint);
    for (const field of ["featureSetVersion", "normalizedName", "normalizedSymbol", "narrativeTheme"] as const) {
      if (typeof row[field] !== "string" || row[field].length > 256) {
        return { rows: [], error: `rows[${index}].${field} is invalid.` };
      }
    }
    if (!Array.isArray(row.narrativeTokens) || row.narrativeTokens.length > 32 || row.narrativeTokens.some(
      (token) => typeof token !== "string" || token.length > 64,
    )) {
      return { rows: [], error: `rows[${index}].narrativeTokens is invalid.` };
    }
    for (const field of [
      "themeConfidence0To100",
      "metadataCompleteness0To100",
      "narrativeNovelty0To100",
      "copyPressure0To100",
    ] as const) {
      if (!boundedNumber(row[field], 0, 100)) {
        return { rows: [], error: `rows[${index}].${field} must be from 0 to 100.` };
      }
    }
    for (const field of [
      "socialLinkCount",
      "nameReusePrior24h",
      "symbolReusePrior24h",
      "themeLaunchesPrior1h",
      "themeLaunchesPrior24h",
      "launchesPrior5m",
      "launchesPrior1h",
      "observationLagMs",
    ] as const) {
      if (!finiteInteger(row[field]) || row[field] < 0) {
        return { rows: [], error: `rows[${index}].${field} must be a non-negative integer.` };
      }
    }
    if (row.themeMomentumRatio !== null && !boundedNumber(row.themeMomentumRatio, 0, 1000)) {
      return { rows: [], error: `rows[${index}].themeMomentumRatio is invalid.` };
    }
    if (typeof row.computedAt !== "string" || !Number.isFinite(Date.parse(row.computedAt))) {
      return { rows: [], error: `rows[${index}].computedAt is invalid.` };
    }
    rows.push(row as unknown as CohortFeatureImportRow);
  }
  return { rows, error: null };
}

export function parseCohortFeatureAggregateRows(value: unknown): {
  rows: CohortFeatureAggregateImportRow[];
  error: string | null;
} {
  if (!Array.isArray(value) || value.length < 1 || value.length > COHORT_IMPORT_BATCH_LIMIT) {
    return { rows: [], error: `rows must contain 1–${COHORT_IMPORT_BATCH_LIMIT} records.` };
  }
  const rows: CohortFeatureAggregateImportRow[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const candidate = value[index];
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      return { rows: [], error: `rows[${index}] must be an object.` };
    }
    const row = candidate as Record<string, unknown>;
    for (const field of ["featureSetVersion", "dimension", "bucket"] as const) {
      if (typeof row[field] !== "string" || row[field].length < 1 || row[field].length > 256) {
        return { rows: [], error: `rows[${index}].${field} is invalid.` };
      }
    }
    const key = `${row.featureSetVersion}\u0000${row.dimension}\u0000${row.bucket}`;
    if (seen.has(key)) return { rows: [], error: `rows[${index}] duplicates an aggregate key.` };
    seen.add(key);
    for (const field of [
      "bucketOrder",
      "launches",
      "confirmedFastGraduations",
      "rightCensored",
      "withoutPublishedOutcome",
    ] as const) {
      if (!finiteInteger(row[field]) || row[field] < 0) {
        return { rows: [], error: `rows[${index}].${field} must be a non-negative integer.` };
      }
    }
    if (
      row.confirmedFastGraduations as number
        + (row.rightCensored as number)
        + (row.withoutPublishedOutcome as number)
      !== row.launches
    ) {
      return { rows: [], error: `rows[${index}] outcome counts must sum to launches.` };
    }
    if (!boundedNumber(row.lowerBoundRatePct, 0, 100)) {
      return { rows: [], error: `rows[${index}].lowerBoundRatePct must be from 0 to 100.` };
    }
    if (typeof row.computedAt !== "string" || !Number.isFinite(Date.parse(row.computedAt))) {
      return { rows: [], error: `rows[${index}].computedAt is invalid.` };
    }
    rows.push(row as unknown as CohortFeatureAggregateImportRow);
  }
  return { rows, error: null };
}
