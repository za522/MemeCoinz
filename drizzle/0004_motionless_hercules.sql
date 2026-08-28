CREATE TABLE `alert_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`prediction_id` text NOT NULL,
	`channel` text NOT NULL,
	`status` text NOT NULL,
	`attempted_at` text NOT NULL,
	`delivered_at` text,
	`provider_message_id` text,
	`failure_reason` text,
	FOREIGN KEY (`prediction_id`) REFERENCES `predictions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_alert_deliveries_prediction_channel` ON `alert_deliveries` (`prediction_id`,`channel`);--> statement-breakpoint
CREATE INDEX `idx_alert_deliveries_status_attempted` ON `alert_deliveries` (`status`,`attempted_at`);