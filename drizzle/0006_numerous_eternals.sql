CREATE TABLE `cohort_launch_features` (
	`mint` text PRIMARY KEY NOT NULL,
	`feature_set_version` text NOT NULL,
	`normalized_name` text NOT NULL,
	`normalized_symbol` text NOT NULL,
	`narrative_theme` text NOT NULL,
	`narrative_tokens_json` text NOT NULL,
	`theme_confidence_0_to_100` real NOT NULL,
	`metadata_completeness_0_to_100` real NOT NULL,
	`social_link_count` integer NOT NULL,
	`name_reuse_prior_24h` integer NOT NULL,
	`symbol_reuse_prior_24h` integer NOT NULL,
	`theme_launches_prior_1h` integer NOT NULL,
	`theme_launches_prior_24h` integer NOT NULL,
	`theme_momentum_ratio` real,
	`launches_prior_5m` integer NOT NULL,
	`launches_prior_1h` integer NOT NULL,
	`narrative_novelty_0_to_100` real NOT NULL,
	`copy_pressure_0_to_100` real NOT NULL,
	`observation_lag_ms` integer NOT NULL,
	`computed_at` text NOT NULL,
	FOREIGN KEY (`mint`) REFERENCES `cohort_launches`(`mint`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_cohort_features_version_theme` ON `cohort_launch_features` (`feature_set_version`,`narrative_theme`);--> statement-breakpoint
CREATE INDEX `idx_cohort_features_novelty` ON `cohort_launch_features` (`narrative_novelty_0_to_100`);--> statement-breakpoint
CREATE INDEX `idx_cohort_features_copy_pressure` ON `cohort_launch_features` (`copy_pressure_0_to_100`);