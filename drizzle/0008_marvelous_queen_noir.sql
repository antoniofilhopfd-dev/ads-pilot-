CREATE TABLE `alert_settings` (
	`organization_id` varchar(36) NOT NULL,
	`config` json NOT NULL,
	`updated_by` varchar(36),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `alert_settings_organization_id` PRIMARY KEY(`organization_id`)
);
--> statement-breakpoint
CREATE TABLE `alerts` (
	`id` varchar(36) NOT NULL,
	`organization_id` varchar(36) NOT NULL,
	`dedupe_key` varchar(120) NOT NULL,
	`type` enum('budget_projection','budget_exceeded','goal_not_met','no_delivery','cost_rise','ctr_drop','frequency_high','stale_sync') NOT NULL,
	`severity` enum('info','warning','critical') NOT NULL,
	`state` enum('open','acknowledged','resolved') NOT NULL DEFAULT 'open',
	`ad_account_id` varchar(36),
	`entity_type` varchar(20) NOT NULL,
	`entity_id` varchar(36) NOT NULL,
	`entity_name` varchar(300) NOT NULL,
	`title` varchar(200) NOT NULL,
	`detail` json NOT NULL,
	`occurrences` int NOT NULL DEFAULT 1,
	`first_seen_at` datetime(3) NOT NULL,
	`last_seen_at` datetime(3) NOT NULL,
	`last_notified_at` datetime(3),
	`acknowledged_by` varchar(36),
	`acknowledged_at` datetime(3),
	`resolved_at` datetime(3),
	CONSTRAINT `alerts_id` PRIMARY KEY(`id`),
	CONSTRAINT `alerts_dedupe_uq` UNIQUE(`organization_id`,`dedupe_key`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` varchar(36) NOT NULL,
	`organization_id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`alert_id` varchar(36),
	`title` varchar(200) NOT NULL,
	`body` varchar(500) NOT NULL,
	`href` varchar(200),
	`read_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `alert_settings` ADD CONSTRAINT `alert_settings_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `alerts` ADD CONSTRAINT `alerts_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_alert_id_alerts_id_fk` FOREIGN KEY (`alert_id`) REFERENCES `alerts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `alerts_org_state_idx` ON `alerts` (`organization_id`,`state`,`last_seen_at`);--> statement-breakpoint
CREATE INDEX `notifications_user_idx` ON `notifications` (`organization_id`,`user_id`,`read_at`,`created_at`);