import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const sources = sqliteTable(
  "sources",
  {
    id: text("id").primaryKey(),
    displayName: text("display_name").notNull(),
    sourceClass: text("source_class").notNull(),
    licenceStatus: text("licence_status").notNull(),
    coverageStart: text("coverage_start"),
    checkedAt: text("checked_at").notNull(),
    schemaVersion: text("schema_version").notNull(),
    healthStatus: text("health_status").notNull(),
  },
  (table) => [index("idx_sources_health_status").on(table.healthStatus)],
);

export const assets = sqliteTable(
  "assets",
  {
    id: text("id").primaryKey(),
    chainId: text("chain_id").notNull(),
    mintAddress: text("mint_address").notNull(),
    venue: text("venue").notNull(),
    name: text("name").notNull(),
    symbol: text("symbol").notNull(),
    creatorAddress: text("creator_address"),
    createdAt: text("created_at").notNull(),
    createdSlot: integer("created_slot"),
    programVersion: text("program_version"),
    metadataObjectKey: text("metadata_object_key"),
    metadataUri: text("metadata_uri"),
    imageUri: text("image_uri"),
    creationSignature: text("creation_signature"),
    lifecycleStage: text("lifecycle_stage").notNull().default("unknown"),
    graduatedAt: text("graduated_at"),
    poolAddress: text("pool_address"),
    canonicalConfirmed: integer("canonical_confirmed", { mode: "boolean" })
      .notNull()
      .default(false),
    updatedAt: text("updated_at").notNull().default(""),
  },
  (table) => [
    uniqueIndex("idx_assets_chain_mint").on(table.chainId, table.mintAddress),
    index("idx_assets_created_at").on(table.createdAt),
    index("idx_assets_creator_created_at").on(table.creatorAddress, table.createdAt),
  ],
);

export const observations = sqliteTable(
  "observations",
  {
    id: text("id").primaryKey(),
    assetId: text("asset_id").references(() => assets.id),
    sourceId: text("source_id").notNull().references(() => sources.id),
    observationType: text("observation_type").notNull(),
    eventAt: text("event_at").notNull(),
    observedAt: text("observed_at"),
    availableAt: text("available_at"),
    retrievedAt: text("retrieved_at").notNull(),
    slot: integer("slot"),
    transactionIndex: integer("transaction_index"),
    instructionIndex: integer("instruction_index"),
    signature: text("signature"),
    commitment: text("commitment"),
    canonicalStatus: text("canonical_status").notNull(),
    fidelity: text("fidelity").notNull(),
    rawObjectKey: text("raw_object_key"),
    normalizedJson: text("normalized_json").notNull(),
    nullReason: text("null_reason"),
  },
  (table) => [
    index("idx_observations_asset_available").on(table.assetId, table.availableAt),
    index("idx_observations_source_event").on(table.sourceId, table.eventAt),
    index("idx_observations_type_event").on(table.observationType, table.eventAt),
  ],
);

export const featureSnapshots = sqliteTable(
  "feature_snapshots",
  {
    id: text("id").primaryKey(),
    assetId: text("asset_id").notNull().references(() => assets.id),
    cutoffSeconds: integer("cutoff_seconds").notNull(),
    decisionAvailableAt: text("decision_available_at").notNull(),
    featureSetVersion: text("feature_set_version").notNull(),
    featureJson: text("feature_json").notNull(),
    fidelityJson: text("fidelity_json").notNull(),
    missingnessJson: text("missingness_json").notNull(),
    computedAt: text("computed_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_feature_snapshots_asset_cutoff_version").on(
      table.assetId,
      table.cutoffSeconds,
      table.featureSetVersion,
    ),
    index("idx_feature_snapshots_decision_time").on(table.decisionAvailableAt),
  ],
);

export const outcomes = sqliteTable(
  "outcomes",
  {
    id: text("id").primaryKey(),
    assetId: text("asset_id").notNull().references(() => assets.id),
    featureSnapshotId: text("feature_snapshot_id").references(() => featureSnapshots.id),
    referenceClock: text("reference_clock"),
    cutoffSeconds: integer("cutoff_seconds"),
    decisionAt: text("decision_at"),
    labelName: text("label_name").notNull(),
    labelVersion: text("label_version").notNull(),
    horizonSeconds: integer("horizon_seconds").notNull(),
    orderSizeUsd: real("order_size_usd"),
    value: real("value"),
    status: text("status").notNull(),
    labelAvailableAt: text("label_available_at").notNull(),
    evidenceJson: text("evidence_json").notNull(),
  },
  (table) => [
    uniqueIndex("idx_outcomes_snapshot_label_version_horizon_size").on(
      table.featureSnapshotId,
      table.labelName,
      table.labelVersion,
      table.horizonSeconds,
      table.orderSizeUsd,
    ),
    index("idx_outcomes_asset_clock_cutoff").on(
      table.assetId,
      table.referenceClock,
      table.cutoffSeconds,
    ),
    index("idx_outcomes_label_available").on(table.labelName, table.labelAvailableAt),
  ],
);

export const predictions = sqliteTable(
  "predictions",
  {
    id: text("id").primaryKey(),
    assetId: text("asset_id").notNull().references(() => assets.id),
    featureSnapshotId: text("feature_snapshot_id").notNull().references(() => featureSnapshots.id),
    modelVersion: text("model_version").notNull(),
    predictionType: text("prediction_type").notNull(),
    probability: real("probability"),
    expectedValue: real("expected_value"),
    lowerBound: real("lower_bound"),
    upperBound: real("upper_bound"),
    explanationJson: text("explanation_json").notNull(),
    writtenAt: text("written_at").notNull(),
    mode: text("mode").notNull(),
  },
  (table) => [
    index("idx_predictions_asset_written").on(table.assetId, table.writtenAt),
    index("idx_predictions_model_type").on(table.modelVersion, table.predictionType),
  ],
);

export const executionProbes = sqliteTable(
  "execution_probes",
  {
    id: text("id").primaryKey(),
    assetId: text("asset_id").notNull().references(() => assets.id),
    predictionId: text("prediction_id").references(() => predictions.id),
    observedAt: text("observed_at").notNull(),
    notionalUsd: real("notional_usd").notNull(),
    side: text("side").notNull(),
    routeProvider: text("route_provider").notNull(),
    quoteLatencyMs: integer("quote_latency_ms"),
    expectedOutput: real("expected_output"),
    priceImpactPct: real("price_impact_pct"),
    priorityFeeLamports: integer("priority_fee_lamports"),
    status: text("status").notNull(),
    failureReason: text("failure_reason"),
    rawObjectKey: text("raw_object_key"),
  },
  (table) => [
    index("idx_execution_probes_asset_time").on(table.assetId, table.observedAt),
    index("idx_execution_probes_status_time").on(table.status, table.observedAt),
  ],
);

export const experiments = sqliteTable(
  "experiments",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    datasetSnapshot: text("dataset_snapshot").notNull(),
    featureSetVersion: text("feature_set_version").notNull(),
    labelVersion: text("label_version").notNull(),
    splitPolicyJson: text("split_policy_json").notNull(),
    metricJson: text("metric_json").notNull(),
    status: text("status").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("idx_experiments_created_at").on(table.createdAt)],
);

export const modelArtifacts = sqliteTable(
  "model_artifacts",
  {
    id: text("id").primaryKey(),
    modelVersion: text("model_version").notNull(),
    status: text("status").notNull(),
    targetName: text("target_name").notNull(),
    targetVersion: text("target_version").notNull(),
    horizonSeconds: integer("horizon_seconds").notNull(),
    orderSizeUsd: real("order_size_usd").notNull(),
    featureSetVersion: text("feature_set_version").notNull(),
    trainingThrough: text("training_through").notNull(),
    datasetFingerprint: text("dataset_fingerprint").notNull(),
    artifactJson: text("artifact_json").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_model_artifacts_version").on(table.modelVersion),
    index("idx_model_artifacts_target_feature_status_created").on(
      table.targetName,
      table.targetVersion,
      table.horizonSeconds,
      table.orderSizeUsd,
      table.featureSetVersion,
      table.status,
      table.createdAt,
    ),
  ],
);

export const alertDeliveries = sqliteTable(
  "alert_deliveries",
  {
    id: text("id").primaryKey(),
    predictionId: text("prediction_id")
      .notNull()
      .references(() => predictions.id),
    channel: text("channel").notNull(),
    status: text("status").notNull(),
    attemptedAt: text("attempted_at").notNull(),
    deliveredAt: text("delivered_at"),
    providerMessageId: text("provider_message_id"),
    failureReason: text("failure_reason"),
  },
  (table) => [
    uniqueIndex("idx_alert_deliveries_prediction_channel").on(
      table.predictionId,
      table.channel,
    ),
    index("idx_alert_deliveries_status_attempted").on(
      table.status,
      table.attemptedAt,
    ),
  ],
);

export const cohortImports = sqliteTable(
  "cohort_imports",
  {
    datasetId: text("dataset_id").primaryKey(),
    datasetVersion: text("dataset_version").notNull(),
    conceptDoi: text("concept_doi").notNull(),
    versionDoi: text("version_doi").notNull(),
    licenseId: text("license_id").notNull(),
    sourceUrl: text("source_url").notNull(),
    sourceWindowStart: text("source_window_start").notNull(),
    sourceWindowEnd: text("source_window_end").notNull(),
    launchesSha256: text("launches_sha256").notNull(),
    outcomesSha256: text("outcomes_sha256").notNull(),
    launchesObjectKey: text("launches_object_key"),
    outcomesObjectKey: text("outcomes_object_key"),
    labelPolicy: text("label_policy").notNull(),
    knownLimitation: text("known_limitation").notNull(),
    status: text("status").notNull(),
    expectedLaunches: integer("expected_launches").notNull(),
    expectedConfirmedFastGraduations: integer("expected_confirmed_fast_graduations").notNull(),
    expectedRightCensored: integer("expected_right_censored").notNull(),
    expectedWithoutPublishedOutcome: integer("expected_without_published_outcome").notNull(),
    importedLaunches: integer("imported_launches").notNull().default(0),
    importedConfirmedFastGraduations: integer("imported_confirmed_fast_graduations").notNull().default(0),
    importedRightCensored: integer("imported_right_censored").notNull().default(0),
    importedWithoutPublishedOutcome: integer("imported_without_published_outcome").notNull().default(0),
    importedAt: text("imported_at"),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("idx_cohort_imports_status").on(table.status)],
);

/**
 * Compact, browseable launch index for an externally published cohort.
 * Raw immutable files live in R2; this table deliberately does not pretend
 * that the source includes transaction history or complete outcome labels.
 */
export const cohortLaunches = sqliteTable(
  "cohort_launches",
  {
    mint: text("mint").primaryKey(),
    datasetId: text("dataset_id")
      .notNull()
      .references(() => cohortImports.datasetId),
    createdAtMs: integer("created_at_ms").notNull(),
    seenAtMs: integer("seen_at_ms").notNull(),
    name: text("name"),
    symbol: text("symbol"),
    initialMarketCapSol: real("initial_market_cap_sol"),
    hasX: integer("has_x", { mode: "boolean" }).notNull(),
    hasWebsite: integer("has_website", { mode: "boolean" }).notNull(),
    hasTelegram: integer("has_telegram", { mode: "boolean" }).notNull(),
    descriptionLength: integer("description_length").notNull(),
    /** 1 = confirmed fast graduation, 0 = right-censored, -1 = no published outcome. */
    observedStatus: integer("observed_status").notNull(),
    observedGraduationAtMs: integer("observed_graduation_at_ms"),
    observedGraduationMinutes: real("observed_graduation_minutes"),
  },
  (table) => [
    index("idx_cohort_launches_dataset_created").on(table.datasetId, table.createdAtMs),
    index("idx_cohort_launches_dataset_status").on(table.datasetId, table.observedStatus),
  ],
);
