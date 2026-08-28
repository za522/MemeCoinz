import { env } from "cloudflare:workers";
import {
  COHORT_PUBLIC_PAGE_LIMIT,
  OBSERVED_STATUS,
  RED_PUMP_DATASET,
} from "./constants";
import type {
  CohortFeatureAggregateImportRow,
  CohortImportRow,
  CohortFeatureImportRow,
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
  feature_set_version: string | null;
  narrative_theme: string | null;
  narrative_tokens_json: string | null;
  theme_confidence_0_to_100: number | null;
  metadata_completeness_0_to_100: number | null;
  social_link_count: number | null;
  name_reuse_prior_24h: number | null;
  symbol_reuse_prior_24h: number | null;
  theme_launches_prior_1h: number | null;
  theme_launches_prior_24h: number | null;
  theme_momentum_ratio: number | null;
  launches_prior_5m: number | null;
  launches_prior_1h: number | null;
  narrative_novelty_0_to_100: number | null;
  copy_pressure_0_to_100: number | null;
  observation_lag_ms: number | null;
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

export async function writeCohortFeatureRows(rows: CohortFeatureImportRow[]): Promise<number> {
  const result = await env.DB.prepare(
    `INSERT INTO cohort_launch_features (
      mint, feature_set_version, normalized_name, normalized_symbol,
      narrative_theme, narrative_tokens_json, theme_confidence_0_to_100,
      metadata_completeness_0_to_100, social_link_count,
      name_reuse_prior_24h, symbol_reuse_prior_24h,
      theme_launches_prior_1h, theme_launches_prior_24h, theme_momentum_ratio,
      launches_prior_5m, launches_prior_1h, narrative_novelty_0_to_100,
      copy_pressure_0_to_100, observation_lag_ms, computed_at
    )
    SELECT
      json_extract(value, '$.mint'), json_extract(value, '$.featureSetVersion'),
      json_extract(value, '$.normalizedName'), json_extract(value, '$.normalizedSymbol'),
      json_extract(value, '$.narrativeTheme'), json_extract(value, '$.narrativeTokens'),
      json_extract(value, '$.themeConfidence0To100'),
      json_extract(value, '$.metadataCompleteness0To100'),
      json_extract(value, '$.socialLinkCount'), json_extract(value, '$.nameReusePrior24h'),
      json_extract(value, '$.symbolReusePrior24h'), json_extract(value, '$.themeLaunchesPrior1h'),
      json_extract(value, '$.themeLaunchesPrior24h'), json_extract(value, '$.themeMomentumRatio'),
      json_extract(value, '$.launchesPrior5m'), json_extract(value, '$.launchesPrior1h'),
      json_extract(value, '$.narrativeNovelty0To100'), json_extract(value, '$.copyPressure0To100'),
      json_extract(value, '$.observationLagMs'), json_extract(value, '$.computedAt')
    FROM json_each(?)
    WHERE 1 = 1
    ON CONFLICT(mint) DO UPDATE SET
      feature_set_version = excluded.feature_set_version,
      normalized_name = excluded.normalized_name,
      normalized_symbol = excluded.normalized_symbol,
      narrative_theme = excluded.narrative_theme,
      narrative_tokens_json = excluded.narrative_tokens_json,
      theme_confidence_0_to_100 = excluded.theme_confidence_0_to_100,
      metadata_completeness_0_to_100 = excluded.metadata_completeness_0_to_100,
      social_link_count = excluded.social_link_count,
      name_reuse_prior_24h = excluded.name_reuse_prior_24h,
      symbol_reuse_prior_24h = excluded.symbol_reuse_prior_24h,
      theme_launches_prior_1h = excluded.theme_launches_prior_1h,
      theme_launches_prior_24h = excluded.theme_launches_prior_24h,
      theme_momentum_ratio = excluded.theme_momentum_ratio,
      launches_prior_5m = excluded.launches_prior_5m,
      launches_prior_1h = excluded.launches_prior_1h,
      narrative_novelty_0_to_100 = excluded.narrative_novelty_0_to_100,
      copy_pressure_0_to_100 = excluded.copy_pressure_0_to_100,
      observation_lag_ms = excluded.observation_lag_ms,
      computed_at = excluded.computed_at`,
  ).bind(JSON.stringify(rows)).run();
  return typeof result.meta.changes === "number" ? result.meta.changes : rows.length;
}

export async function writeCohortFeatureAggregateRows(
  rows: CohortFeatureAggregateImportRow[],
): Promise<number> {
  const result = await env.DB.prepare(
    `INSERT INTO cohort_feature_aggregates (
      feature_set_version, dimension, bucket, bucket_order, launches,
      confirmed_fast_graduations, right_censored, without_published_outcome,
      lower_bound_rate_pct, computed_at
    )
    SELECT
      json_extract(value, '$.featureSetVersion'), json_extract(value, '$.dimension'),
      json_extract(value, '$.bucket'), json_extract(value, '$.bucketOrder'),
      json_extract(value, '$.launches'), json_extract(value, '$.confirmedFastGraduations'),
      json_extract(value, '$.rightCensored'), json_extract(value, '$.withoutPublishedOutcome'),
      json_extract(value, '$.lowerBoundRatePct'), json_extract(value, '$.computedAt')
    FROM json_each(?)
    WHERE 1 = 1
    ON CONFLICT(feature_set_version, dimension, bucket) DO UPDATE SET
      bucket_order = excluded.bucket_order,
      launches = excluded.launches,
      confirmed_fast_graduations = excluded.confirmed_fast_graduations,
      right_censored = excluded.right_censored,
      without_published_outcome = excluded.without_published_outcome,
      lower_bound_rate_pct = excluded.lower_bound_rate_pct,
      computed_at = excluded.computed_at`,
  ).bind(JSON.stringify(rows)).run();
  return typeof result.meta.changes === "number" ? result.meta.changes : rows.length;
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
    calculated: row.feature_set_version === null ? null : {
      featureSetVersion: row.feature_set_version,
      narrativeTheme: row.narrative_theme ?? "other",
      narrativeTokens: (() => {
        try {
          const value: unknown = JSON.parse(row.narrative_tokens_json ?? "[]");
          return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
        } catch {
          return [];
        }
      })(),
      themeConfidence0To100: row.theme_confidence_0_to_100 ?? 0,
      metadataCompleteness0To100: row.metadata_completeness_0_to_100 ?? 0,
      socialLinkCount: row.social_link_count ?? 0,
      nameReusePrior24h: row.name_reuse_prior_24h ?? 0,
      symbolReusePrior24h: row.symbol_reuse_prior_24h ?? 0,
      themeLaunchesPrior1h: row.theme_launches_prior_1h ?? 0,
      themeLaunchesPrior24h: row.theme_launches_prior_24h ?? 0,
      themeMomentumRatio: row.theme_momentum_ratio,
      launchesPrior5m: row.launches_prior_5m ?? 0,
      launchesPrior1h: row.launches_prior_1h ?? 0,
      narrativeNovelty0To100: row.narrative_novelty_0_to_100 ?? 0,
      copyPressure0To100: row.copy_pressure_0_to_100 ?? 0,
      observationLagMs: row.observation_lag_ms ?? 0,
    },
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
  const clauses = ["l.dataset_id = ?"];
  const bindings: unknown[] = [RED_PUMP_DATASET.id];
  if (options.observedStatus && options.observedStatus !== "all") {
    const status = options.observedStatus === "confirmed-fast-graduation"
      ? OBSERVED_STATUS.confirmedFastGraduation
      : options.observedStatus === "right-censored"
        ? OBSERVED_STATUS.rightCensored
        : OBSERVED_STATUS.withoutPublishedOutcome;
    clauses.push("l.observed_status = ?");
    bindings.push(status);
  }
  if (cursor) {
    clauses.push("(l.created_at_ms < ? OR (l.created_at_ms = ? AND l.mint < ?))");
    bindings.push(cursor.createdAtMs, cursor.createdAtMs, cursor.mint);
  }
  bindings.push(limit + 1);
  const result = await env.DB.prepare(
    `SELECT l.mint, l.created_at_ms, l.seen_at_ms, l.name, l.symbol, l.initial_market_cap_sol,
      has_x, has_website, has_telegram, description_length, observed_status,
      observed_graduation_at_ms, observed_graduation_minutes,
      f.feature_set_version, f.narrative_theme, f.narrative_tokens_json,
      f.theme_confidence_0_to_100, f.metadata_completeness_0_to_100,
      f.social_link_count, f.name_reuse_prior_24h, f.symbol_reuse_prior_24h,
      f.theme_launches_prior_1h, f.theme_launches_prior_24h, f.theme_momentum_ratio,
      f.launches_prior_5m, f.launches_prior_1h, f.narrative_novelty_0_to_100,
      f.copy_pressure_0_to_100, f.observation_lag_ms
    FROM cohort_launches l
    LEFT JOIN cohort_launch_features f ON f.mint = l.mint
    WHERE ${clauses.join(" AND ")}
    ORDER BY created_at_ms DESC, l.mint DESC
    LIMIT ?`,
  ).bind(...bindings).all<LaunchDbRow>();
  const hasMore = result.results.length > limit;
  const pageRows = result.results.slice(0, limit);
  const finalRow = pageRows.at(-1);
  const dataset = await readCohortStatus();
  const featureCountRow = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM cohort_launch_features WHERE feature_set_version = ?",
  ).bind("cohort-metadata-narrative-v1").first<{ count: number }>();
  const featureRows = Number(featureCountRow?.count ?? 0);
  const featurePct = dataset.counts.launches === 0 ? 0 : featureRows / dataset.counts.launches * 100;
  const associationResult = await env.DB.prepare(
    `SELECT dimension, bucket, launches, confirmed_fast_graduations, lower_bound_rate_pct
     FROM cohort_feature_aggregates
     WHERE feature_set_version = ? AND launches >= 1000
     ORDER BY lower_bound_rate_pct DESC, launches DESC
     LIMIT 8`,
  ).bind("cohort-metadata-narrative-v1").all<{
    dimension: string;
    bucket: string;
    launches: number;
    confirmed_fast_graduations: number;
    lower_bound_rate_pct: number;
  }>();
  return {
    generatedAt: new Date().toISOString(),
    dataset,
    launches: pageRows.map(launchFromRow),
    calculatedCoverage: {
      featureSetVersion: "cohort-metadata-narrative-v1",
      rows: featureRows,
      pct: Math.round(featurePct * 100) / 100,
      status: featureRows === 0 ? "not-calculated" : featureRows === dataset.counts.launches ? "complete" : "partial",
      meaning: "Metadata narrative, reuse, novelty, launch-rate, completeness, and observation-lag features only; not X sentiment, wallet coordination, or trade outcomes.",
    },
    featureAssociations: {
      method: "Descriptive lower bound: confirmed fast graduations divided by all launches in the bucket. Right-censored launches remain in the denominator, so this is not a failure rate, causal effect, or complete profitability label.",
      rows: associationResult.results.map((row) => ({
        dimension: row.dimension,
        bucket: row.bucket,
        launches: row.launches,
        confirmedFastGraduations: row.confirmed_fast_graduations,
        lowerBoundRatePct: row.lower_bound_rate_pct,
      })),
    },
    pagination: {
      limit,
      hasMore,
      nextCursor: hasMore && finalRow
        ? encodeCursor({ createdAtMs: finalRow.created_at_ms, mint: finalRow.mint })
        : null,
    },
  };
}
