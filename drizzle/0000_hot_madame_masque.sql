CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`chain_id` text NOT NULL,
	`mint_address` text NOT NULL,
	`venue` text NOT NULL,
	`name` text NOT NULL,
	`symbol` text NOT NULL,
	`creator_address` text,
	`created_at` text NOT NULL,
	`created_slot` integer,
	`program_version` text,
	`metadata_object_key` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_assets_chain_mint` ON `assets` (`chain_id`,`mint_address`);--> statement-breakpoint
CREATE INDEX `idx_assets_created_at` ON `assets` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_assets_creator_created_at` ON `assets` (`creator_address`,`created_at`);--> statement-breakpoint
CREATE TABLE `execution_probes` (
	`id` text PRIMARY KEY NOT NULL,
	`asset_id` text NOT NULL,
	`prediction_id` text,
	`observed_at` text NOT NULL,
	`notional_usd` real NOT NULL,
	`side` text NOT NULL,
	`route_provider` text NOT NULL,
	`quote_latency_ms` integer,
	`expected_output` real,
	`price_impact_pct` real,
	`priority_fee_lamports` integer,
	`status` text NOT NULL,
	`failure_reason` text,
	`raw_object_key` text,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`prediction_id`) REFERENCES `predictions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_execution_probes_asset_time` ON `execution_probes` (`asset_id`,`observed_at`);--> statement-breakpoint
CREATE INDEX `idx_execution_probes_status_time` ON `execution_probes` (`status`,`observed_at`);--> statement-breakpoint
CREATE TABLE `experiments` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`dataset_snapshot` text NOT NULL,
	`feature_set_version` text NOT NULL,
	`label_version` text NOT NULL,
	`split_policy_json` text NOT NULL,
	`metric_json` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_experiments_created_at` ON `experiments` (`created_at`);--> statement-breakpoint
CREATE TABLE `feature_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`asset_id` text NOT NULL,
	`cutoff_seconds` integer NOT NULL,
	`decision_available_at` text NOT NULL,
	`feature_set_version` text NOT NULL,
	`feature_json` text NOT NULL,
	`fidelity_json` text NOT NULL,
	`missingness_json` text NOT NULL,
	`computed_at` text NOT NULL,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_feature_snapshots_asset_cutoff_version` ON `feature_snapshots` (`asset_id`,`cutoff_seconds`,`feature_set_version`);--> statement-breakpoint
CREATE INDEX `idx_feature_snapshots_decision_time` ON `feature_snapshots` (`decision_available_at`);--> statement-breakpoint
CREATE TABLE `observations` (
	`id` text PRIMARY KEY NOT NULL,
	`asset_id` text,
	`source_id` text NOT NULL,
	`observation_type` text NOT NULL,
	`event_at` text NOT NULL,
	`observed_at` text,
	`available_at` text,
	`retrieved_at` text NOT NULL,
	`slot` integer,
	`transaction_index` integer,
	`commitment` text,
	`canonical_status` text NOT NULL,
	`fidelity` text NOT NULL,
	`raw_object_key` text,
	`normalized_json` text NOT NULL,
	`null_reason` text,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_observations_asset_available` ON `observations` (`asset_id`,`available_at`);--> statement-breakpoint
CREATE INDEX `idx_observations_source_event` ON `observations` (`source_id`,`event_at`);--> statement-breakpoint
CREATE INDEX `idx_observations_type_event` ON `observations` (`observation_type`,`event_at`);--> statement-breakpoint
CREATE TABLE `outcomes` (
	`id` text PRIMARY KEY NOT NULL,
	`asset_id` text NOT NULL,
	`label_name` text NOT NULL,
	`label_version` text NOT NULL,
	`horizon_seconds` integer NOT NULL,
	`order_size_usd` real,
	`value` real,
	`status` text NOT NULL,
	`label_available_at` text NOT NULL,
	`evidence_json` text NOT NULL,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_outcomes_asset_label_version_horizon_size` ON `outcomes` (`asset_id`,`label_name`,`label_version`,`horizon_seconds`,`order_size_usd`);--> statement-breakpoint
CREATE INDEX `idx_outcomes_label_available` ON `outcomes` (`label_name`,`label_available_at`);--> statement-breakpoint
CREATE TABLE `predictions` (
	`id` text PRIMARY KEY NOT NULL,
	`asset_id` text NOT NULL,
	`feature_snapshot_id` text NOT NULL,
	`model_version` text NOT NULL,
	`prediction_type` text NOT NULL,
	`probability` real,
	`expected_value` real,
	`lower_bound` real,
	`upper_bound` real,
	`explanation_json` text NOT NULL,
	`written_at` text NOT NULL,
	`mode` text NOT NULL,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`feature_snapshot_id`) REFERENCES `feature_snapshots`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_predictions_asset_written` ON `predictions` (`asset_id`,`written_at`);--> statement-breakpoint
CREATE INDEX `idx_predictions_model_type` ON `predictions` (`model_version`,`prediction_type`);--> statement-breakpoint
CREATE TABLE `sources` (
	`id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`source_class` text NOT NULL,
	`licence_status` text NOT NULL,
	`coverage_start` text,
	`checked_at` text NOT NULL,
	`schema_version` text NOT NULL,
	`health_status` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_sources_health_status` ON `sources` (`health_status`);