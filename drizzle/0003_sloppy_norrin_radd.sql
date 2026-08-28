CREATE TABLE `model_artifacts` (
	`id` text PRIMARY KEY NOT NULL,
	`model_version` text NOT NULL,
	`status` text NOT NULL,
	`target_name` text NOT NULL,
	`target_version` text NOT NULL,
	`horizon_seconds` integer NOT NULL,
	`order_size_usd` real NOT NULL,
	`feature_set_version` text NOT NULL,
	`training_through` text NOT NULL,
	`dataset_fingerprint` text NOT NULL,
	`artifact_json` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_model_artifacts_version` ON `model_artifacts` (`model_version`);--> statement-breakpoint
CREATE INDEX `idx_model_artifacts_target_feature_status_created` ON `model_artifacts` (`target_name`,`target_version`,`horizon_seconds`,`order_size_usd`,`feature_set_version`,`status`,`created_at`);