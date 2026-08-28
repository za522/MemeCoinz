import { env } from "cloudflare:workers";
import {
  COHORT_PUBLIC_PAGE_LIMIT,
  OBSERVED_STATUS,
  RED_PUMP_DATASET,
} from "./constants";
import type {
  CohortImportRow,
  CohortLaunchListItem,
  CohortLaunchesResponse,
  CohortManifestStatus,
  CohortObservedStatus,
} from "./types";

interface ManifestDbRow {
  dataset_id: string;
  dataset_version: string;
  license_id: string;
  source_url: string;
  source_window_start: string;
  source_window_end: string;
  launches_object_key: string | null;
  outcomes_object_key: string | null;
  label_policy: string;
  known_limitation: string;
  status: CohortManifestStatus["status"];
  expected_launches: number;
  expected_confirmed_fast_graduations: number;
  expected_right_censored: number;
  expected_without_published_outcome: number;
  imported_launches: number;
  imported_confirmed_fast_graduations: number;
  imported_right_censored: number;
  imported_without_published_outcome: number;
  imported_at: string | null;
  updated_at: string;
}
interface LaunchDbRow {
  mint: string;
  created_at_ms: number;
  seen_at_ms: number;
  name: string | null;
  symbol: string | null;
  initial_market_cap_sol: number | null;
  has_x: number;
  has_website: number;
  has_telegram: number;
  description_length: number;
  observed_status: -1 | 0 | 1;
  observed_graduation_at_ms: number | null;
  observed_graduation_minutes: number | null;
}

interface CursorValue {
  createdAtMs: number;
  mint: string;
}

function emptyStatus(): CohortManifestStatus {
  return {
    datasetId: RED_PUMP_DATASET.id,
    datasetVersion: RED_PUMP_DATASET.version,
    status: "not-imported",
    source: {
      versionDoi: RED_PUMP_DATASET.versionDoi,
      sourceUrl: RED_PUMP_DATASET.sourceUrl,
      licenseId: RED_PUMP_DATASET.licenseId,
      windowStart: RED_PUMP_DATASET.sourceWindowStart,
      windowEnd: RED_PUMP_DATASET.sourceWindowEnd,
      rawFilesStored: false,
    },
    counts: {
      launches: 0,
      confirmedFastGraduations: 0,
      rightCensored: 0,
      withoutPublishedOutcome: 0,
    },
    expectedCounts: { ...RED_PUMP_DATASET.expected },
    labelPolicy: RED_PUMP_DATASET.labelPolicy,
    knownLimitation: RED_PUMP_DATASET.knownLimitation,
    importedAt: null,
    updatedAt: null,
  };
}

function statusFromRow(row: ManifestDbRow): CohortManifestStatus {
  return {
    datasetId: row.dataset_id,
    datasetVersion: row.dataset_version,
    status: row.status,
    source: {
      versionDoi: RED_PUMP_DATASET.versionDoi,
      sourceUrl: row.source_url,
      licenseId: row.license_id,
      windowStart: row.source_window_start,
      windowEnd: row.source_window_end,
      rawFilesStored: Boolean(row.launches_object_key && row.outcomes_object_key),
    },
    counts: {
      launches: row.imported_launches,
      confirmedFastGraduations: row.imported_confirmed_fast_graduations,
      rightCensored: row.imported_right_censored,
      withoutPublishedOutcome: row.imported_without_published_outcome,
    },
    expectedCounts: {
      launches: row.expected_launches,
      confirmedFastGraduations: row.expected_confirmed_fast_graduations,
      rightCensored: row.expected_right_censored,
      withoutPublishedOutcome: row.expected_without_published_outcome,
    },
    labelPolicy: row.label_policy,
    knownLimitation: row.known_limitation,
    importedAt: row.imported_at,
    updatedAt: row.updated_at,
  };
}

export async function readCohortStatus(): Promise<CohortManifestStatus> {
  const row = await env.DB.prepare(
    "SELECT * FROM cohort_imports WHERE dataset_id = ? LIMIT 1",
  ).bind(RED_PUMP_DATASET.id).first<ManifestDbRow>();
  return row ? statusFromRow(row) : emptyStatus();
}

export async function initializeCohortImport(now = new Date().toISOString()): Promise<CohortManifestStatus> {
  const dataset = RED_PUMP_DATASET;
  await env.DB.prepare(
    `INSERT INTO cohort_imports (
      dataset_id, dataset_version, concept_doi, version_doi, license_id,
      source_url, source_window_start, source_window_end,
      launches_sha256, outcomes_sha256, label_policy, known_limitation,
      status, expected_launches, expected_confirmed_fast_graduations,
      expected_right_censored, expected_without_published_outcome, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'importing', ?, ?, ?, ?, ?)
    ON CONFLICT(dataset_id) DO UPDATE SET
      dataset_version = excluded.dataset_version,
      concept_doi = excluded.concept_doi,
      version_doi = excluded.version_doi,
      license_id = excluded.license_id,
      source_url = excluded.source_url,
      source_window_start = excluded.source_window_start,
      source_window_end = excluded.source_window_end,
      launches_sha256 = excluded.launches_sha256,
      outcomes_sha256 = excluded.outcomes_sha256,
      label_policy = excluded.label_policy,
      known_limitation = excluded.known_limitation,
      status = CASE WHEN cohort_imports.status = 'ready' THEN 'ready' ELSE 'importing' END,
      updated_at = excluded.updated_at`,
  ).bind(
    dataset.id,
    dataset.version,
    dataset.conceptDoi,
    dataset.versionDoi,
    dataset.licenseId,
    dataset.sourceUrl,
    dataset.sourceWindowStart,
    dataset.sourceWindowEnd,
    dataset.launchesFile.sha256,
    dataset.outcomesFile.sha256,
    dataset.labelPolicy,
    dataset.knownLimitation,
    dataset.expected.launches,
    dataset.expected.confirmedFastGraduations,
    dataset.expected.rightCensored,
    dataset.expected.withoutPublishedOutcome,
    now,
  ).run();
  return readCohortStatus();
}

export async function writeCohortRows(rows: CohortImportRow[]): Promise<number> {
  const result = await env.DB.prepare(
    `INSERT INTO cohort_launches (
      mint, dataset_id, created_at_ms, seen_at_ms, name, symbol,
      initial_market_cap_sol, has_x, has_website, has_telegram,
      description_length, observed_status, observed_graduation_at_ms,
      observed_graduation_minutes
    )
    SELECT
      json_extract(value, '$.mint'), ?,
      json_extract(value, '$.createdAtMs'), json_extract(value, '$.seenAtMs'),
      json_extract(value, '$.name'), json_extract(value, '$.symbol'),
      json_extract(value, '$.initialMarketCapSol'), json_extract(value, '$.hasX'),
      json_extract(value, '$.hasWebsite'), json_extract(value, '$.hasTelegram'),
      json_extract(value, '$.descriptionLength'), json_extract(value, '$.observedStatus'),
      json_extract(value, '$.observedGraduationAtMs'),
      json_extract(value, '$.observedGraduationMinutes')
    FROM json_each(?)
    WHERE 1 = 1
    ON CONFLICT(mint) DO UPDATE SET
      dataset_id = excluded.dataset_id,
      created_at_ms = excluded.created_at_ms,
      seen_at_ms = excluded.seen_at_ms,
      name = excluded.name,
      symbol = excluded.symbol,
      initial_market_cap_sol = excluded.initial_market_cap_sol,
      has_x = excluded.has_x,
      has_website = excluded.has_website,
      has_telegram = excluded.has_telegram,
      description_length = excluded.description_length,
      observed_status = excluded.observed_status,
      observed_graduation_at_ms = excluded.observed_graduation_at_ms,
      observed_graduation_minutes = excluded.observed_graduation_minutes`,
  ).bind(RED_PUMP_DATASET.id, JSON.stringify(rows)).run();
  await env.DB.prepare(
    "UPDATE cohort_imports SET status = 'importing', updated_at = ? WHERE dataset_id = ? AND status <> 'ready'",
  ).bind(new Date().toISOString(), RED_PUMP_DATASET.id).run();
  const changes = result.meta.changes;
  return typeof changes === "number" ? changes : rows.length;
}

export async function recordRawObject(
  filename: string,
  objectKey: string,
): Promise<void> {
  const column = filename === RED_PUMP_DATASET.launchesFile.name
    ? "launches_object_key"
    : "outcomes_object_key";
  await env.DB.prepare(
    `UPDATE cohort_imports SET ${column} = ?, updated_at = ? WHERE dataset_id = ?`,
  ).bind(objectKey, new Date().toISOString(), RED_PUMP_DATASET.id).run();
}

export async function finalizeCohortImport(now = new Date().toISOString()): Promise<CohortManifestStatus> {
  const counts = await env.DB.prepare(
    `SELECT
      COUNT(*) AS launches,
      COALESCE(SUM(CASE WHEN observed_status = 1 THEN 1 ELSE 0 END), 0) AS confirmed_fast,
      COALESCE(SUM(CASE WHEN observed_status = 0 THEN 1 ELSE 0 END), 0) AS right_censored,
      COALESCE(SUM(CASE WHEN observed_status = -1 THEN 1 ELSE 0 END), 0) AS without_outcome
    FROM cohort_launches WHERE dataset_id = ?`,
  ).bind(RED_PUMP_DATASET.id).first<{
    launches: number;
    confirmed_fast: number;
    right_censored: number;
    without_outcome: number;
  }>();
  const manifest = await readCohortStatus();
  const actual = {
    launches: Number(counts?.launches ?? 0),
    confirmedFastGraduations: Number(counts?.confirmed_fast ?? 0),
    rightCensored: Number(counts?.right_censored ?? 0),
    withoutPublishedOutcome: Number(counts?.without_outcome ?? 0),
  };
  const exact = Object.entries(RED_PUMP_DATASET.expected).every(
    ([key, value]) => actual[key as keyof typeof actual] === value,
  );
  const ready = exact && manifest.source.rawFilesStored;
  await env.DB.prepare(
    `UPDATE cohort_imports SET
      status = ?, imported_launches = ?, imported_confirmed_fast_graduations = ?,
      imported_right_censored = ?, imported_without_published_outcome = ?,
      imported_at = ?, updated_at = ?
    WHERE dataset_id = ?`,
  ).bind(
    ready ? "ready" : "failed-validation",
    actual.launches,
    actual.confirmedFastGraduations,
    actual.rightCensored,
    actual.withoutPublishedOutcome,
    ready ? now : null,
    now,
    RED_PUMP_DATASET.id,
  ).run();
  return readCohortStatus();
}

function encodeCursor(value: CursorValue): string {
  return btoa(`${value.createdAtMs}:${value.mint}`)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function decodeCursor(value: string | null): CursorValue | null {
  if (!value || value.length > 128) return null;
  try {
    const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
    const decoded = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
    const separator = decoded.indexOf(":");
    const createdAtMs = Number.parseInt(decoded.slice(0, separator), 10);
    const mint = decoded.slice(separator + 1);
    if (!Number.isSafeInteger(createdAtMs) || !mint) return null;
    return { createdAtMs, mint };
  } catch {
    return null;
  }
}

export function isValidCohortCursor(value: string): boolean {
  return decodeCursor(value) !== null;
}

function publicStatus(value: number): CohortObservedStatus {
  if (value === OBSERVED_STATUS.confirmedFastGraduation) return "confirmed-fast-graduation";
  if (value === OBSERVED_STATUS.rightCensored) return "right-censored";
  return "without-published-outcome";
}

function launchFromRow(row: LaunchDbRow): CohortLaunchListItem {
  return {
    mint: row.mint,
    name: row.name,
    symbol: row.symbol,
    createdAt: new Date(row.created_at_ms).toISOString(),
    firstObservedAt: new Date(row.seen_at_ms).toISOString(),
    initialMarketCapSol: row.initial_market_cap_sol,
    hasX: row.has_x === 1,
    hasWebsite: row.has_website === 1,
    hasTelegram: row.has_telegram === 1,
    descriptionLength: row.description_length,
    observedStatus: publicStatus(row.observed_status),
    observedGraduationAt: row.observed_graduation_at_ms === null
      ? null
      : new Date(row.observed_graduation_at_ms).toISOString(),
    observedGraduationMinutes: row.observed_graduation_minutes,
  };
}

export async function listCohortLaunches(options: {
  limit?: number;
  cursor?: string | null;
  observedStatus?: CohortObservedStatus | "all";
} = {}): Promise<CohortLaunchesResponse> {
  const limit = Math.min(
    COHORT_PUBLIC_PAGE_LIMIT,
    Math.max(1, Math.trunc(options.limit ?? 50)),
  );
  const cursor = decodeCursor(options.cursor ?? null);
  const clauses = ["dataset_id = ?"];
  const bindings: unknown[] = [RED_PUMP_DATASET.id];
  if (options.observedStatus && options.observedStatus !== "all") {
    const status = options.observedStatus === "confirmed-fast-graduation"
      ? OBSERVED_STATUS.confirmedFastGraduation
      : options.observedStatus === "right-censored"
        ? OBSERVED_STATUS.rightCensored
        : OBSERVED_STATUS.withoutPublishedOutcome;
    clauses.push("observed_status = ?");
    bindings.push(status);
  }
  if (cursor) {
    clauses.push("(created_at_ms < ? OR (created_at_ms = ? AND mint < ?))");
    bindings.push(cursor.createdAtMs, cursor.createdAtMs, cursor.mint);
  }
  bindings.push(limit + 1);
  const result = await env.DB.prepare(
    `SELECT mint, created_at_ms, seen_at_ms, name, symbol, initial_market_cap_sol,
      has_x, has_website, has_telegram, description_length, observed_status,
      observed_graduation_at_ms, observed_graduation_minutes
    FROM cohort_launches
    WHERE ${clauses.join(" AND ")}
    ORDER BY created_at_ms DESC, mint DESC
    LIMIT ?`,
  ).bind(...bindings).all<LaunchDbRow>();
  const hasMore = result.results.length > limit;
  const pageRows = result.results.slice(0, limit);
  const finalRow = pageRows.at(-1);
  return {
    generatedAt: new Date().toISOString(),
    dataset: await readCohortStatus(),
    launches: pageRows.map(launchFromRow),
    pagination: {
      limit,
      hasMore,
      nextCursor: hasMore && finalRow
        ? encodeCursor({ createdAtMs: finalRow.created_at_ms, mint: finalRow.mint })
        : null,
    },
  };
}
