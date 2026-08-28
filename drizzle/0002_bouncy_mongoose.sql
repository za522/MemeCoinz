DROP INDEX `idx_outcomes_asset_label_version_horizon_size`;--> statement-breakpoint
ALTER TABLE `outcomes` ADD `feature_snapshot_id` text REFERENCES feature_snapshots(id);--> statement-breakpoint
ALTER TABLE `outcomes` ADD `reference_clock` text;--> statement-breakpoint
ALTER TABLE `outcomes` ADD `cutoff_seconds` integer;--> statement-breakpoint
ALTER TABLE `outcomes` ADD `decision_at` text;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_outcomes_snapshot_label_version_horizon_size` ON `outcomes` (`feature_snapshot_id`,`label_name`,`label_version`,`horizon_seconds`,`order_size_usd`);--> statement-breakpoint
CREATE INDEX `idx_outcomes_asset_clock_cutoff` ON `outcomes` (`asset_id`,`reference_clock`,`cutoff_seconds`);