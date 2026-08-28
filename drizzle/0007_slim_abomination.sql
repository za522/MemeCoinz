CREATE TABLE `cohort_feature_aggregates` (
	`feature_set_version` text NOT NULL,
	`dimension` text NOT NULL,
	`bucket` text NOT NULL,
	`bucket_order` integer NOT NULL,
	`launches` integer NOT NULL,
	`confirmed_fast_graduations` integer NOT NULL,
	`right_censored` integer NOT NULL,
	`without_published_outcome` integer NOT NULL,
	`lower_bound_rate_pct` real NOT NULL,
	`computed_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_cohort_feature_aggregates_key` ON `cohort_feature_aggregates` (`feature_set_version`,`dimension`,`bucket`);--> statement-breakpoint
CREATE INDEX `idx_cohort_feature_aggregates_dimension_order` ON `cohort_feature_aggregates` (`dimension`,`bucket_order`);