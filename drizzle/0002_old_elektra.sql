CREATE TABLE `demo_remote_state` (
	`organization_id` varchar(36) NOT NULL,
	`account_external_id` varchar(40) NOT NULL,
	`campaign_external_id` varchar(40) NOT NULL,
	`status` varchar(30),
	`daily_budget` decimal(14,2),
	CONSTRAINT `demo_state_pk` PRIMARY KEY(`organization_id`,`account_external_id`,`campaign_external_id`)
);
--> statement-breakpoint
CREATE TABLE `operations` (
	`id` varchar(36) NOT NULL,
	`organization_id` varchar(36) NOT NULL,
	`ad_account_id` varchar(36) NOT NULL,
	`campaign_id` varchar(36) NOT NULL,
	`client_id` varchar(36),
	`type` enum('pause','activate','set_daily_budget') NOT NULL,
	`mode` enum('demo','meta') NOT NULL,
	`params` json NOT NULL,
	`before` json NOT NULL,
	`after` json,
	`warnings` json NOT NULL,
	`status` enum('prepared','executing','succeeded','failed','ambiguous','expired','cancelled') NOT NULL,
	`created_by` varchar(36) NOT NULL,
	`confirmed_by` varchar(36),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`expires_at` datetime(3) NOT NULL,
	`executed_at` datetime(3),
	`verified_at` datetime(3),
	`result_message` varchar(400),
	CONSTRAINT `operations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `demo_remote_state` ADD CONSTRAINT `demo_remote_state_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `operations` ADD CONSTRAINT `operations_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `operations` ADD CONSTRAINT `operations_ad_account_id_ad_accounts_id_fk` FOREIGN KEY (`ad_account_id`) REFERENCES `ad_accounts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `operations` ADD CONSTRAINT `operations_campaign_id_campaigns_id_fk` FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `operations_org_idx` ON `operations` (`organization_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `operations_campaign_idx` ON `operations` (`campaign_id`);