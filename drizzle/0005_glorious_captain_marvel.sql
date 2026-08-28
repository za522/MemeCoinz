CREATE TABLE `cohort_imports` (
	`dataset_id` text PRIMARY KEY NOT NULL,
	`dataset_version` text NOT NULL,
	`concept_doi` text NOT NULL,
	`version_doi` text NOT NULL,
	`license_id` text NOT NULL,
	`source_url` text NOT NULL,
	`source_window_start` text NOT NULL,
	`source_window_end` text NOT NULL,
	`launches_sha256` text NOT NULL,
	`outcomes_sha256` text NOT NULL,
	`launches_object_key` text,
	`outcomes_object_key` text,
	`label_policy` text NOT NULL,
	`known_limitation` text NOT NULL,
	`status` text NOT NULL,
	`expected_launches` integer NOT NULL,
	`expected_confirmed_fast_graduations` integer NOT NULL,
	`expected_right_censored` integer NOT NULL,
	`expected_without_published_outcome` integer NOT NULL,
	`imported_launches` integer DEFAULT 0 NOT NULL,
	`imported_confirmed_fast_graduations` integer DEFAULT 0 NOT NULL,
	`imported_right_censored` integer DEFAULT 0 NOT NULL,
	`imported_without_published_outcome` integer DEFAULT 0 NOT NULL,
	`imported_at` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_cohort_imports_status` ON `cohort_imports` (`status`);--> statement-breakpoint
CREATE TABLE `cohort_launches` (
	`mint` text PRIMARY KEY NOT NULL,
	`dataset_id` text NOT NULL,
	`created_at_ms` integer NOT NULL,
	`seen_at_ms` integer NOT NULL,
	`name` text,
	`symbol` text,
	`initial_market_cap_sol` real,
	`has_x` integer NOT NULL,
	`has_website` integer NOT NULL,
	`has_telegram` integer NOT NULL,
	`description_length` integer NOT NULL,
	`observed_status` integer NOT NULL,
	`observed_graduation_at_ms` integer,
	`observed_graduation_minutes` real,
	FOREIGN KEY (`dataset_id`) REFERENCES `cohort_imports`(`dataset_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_cohort_launches_dataset_created` ON `cohort_launches` (`dataset_id`,`created_at_ms`);--> statement-breakpoint
CREATE INDEX `idx_cohort_launches_dataset_status` ON `cohort_launches` (`dataset_id`,`observed_status`);