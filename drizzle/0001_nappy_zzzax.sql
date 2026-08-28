ALTER TABLE `assets` ADD `metadata_uri` text;--> statement-breakpoint
ALTER TABLE `assets` ADD `image_uri` text;--> statement-breakpoint
ALTER TABLE `assets` ADD `creation_signature` text;--> statement-breakpoint
ALTER TABLE `assets` ADD `lifecycle_stage` text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE `assets` ADD `graduated_at` text;--> statement-breakpoint
ALTER TABLE `assets` ADD `pool_address` text;--> statement-breakpoint
ALTER TABLE `assets` ADD `canonical_confirmed` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `assets` ADD `updated_at` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `observations` ADD `instruction_index` integer;--> statement-breakpoint
ALTER TABLE `observations` ADD `signature` text;