CREATE TABLE `ad_accounts` (
	`id` varchar(36) NOT NULL,
	`organization_id` varchar(36) NOT NULL,
	`connection_id` varchar(36) NOT NULL,
	`client_id` varchar(36),
	`external_id` varchar(40) NOT NULL,
	`name` varchar(200) NOT NULL,
	`currency` varchar(3) NOT NULL,
	`timezone` varchar(60),
	`remote_status` varchar(40),
	`is_selected` boolean NOT NULL DEFAULT false,
	`last_synced_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `ad_accounts_id` PRIMARY KEY(`id`),
	CONSTRAINT `ad_accounts_org_ext_uq` UNIQUE(`organization_id`,`external_id`)
);
--> statement-breakpoint
CREATE TABLE `ad_sets` (
	`id` varchar(36) NOT NULL,
	`organization_id` varchar(36) NOT NULL,
	`campaign_id` varchar(36) NOT NULL,
	`external_id` varchar(40) NOT NULL,
	`name` varchar(300) NOT NULL,
	`status` varchar(30),
	`effective_status` varchar(30),
	`optimization_goal` varchar(60),
	`daily_budget` decimal(14,2),
	`lifetime_budget` decimal(14,2),
	`synced_at` datetime(3) NOT NULL,
	CONSTRAINT `ad_sets_id` PRIMARY KEY(`id`),
	CONSTRAINT `ad_sets_camp_ext_uq` UNIQUE(`campaign_id`,`external_id`)
);
--> statement-breakpoint
CREATE TABLE `ads` (
	`id` varchar(36) NOT NULL,
	`organization_id` varchar(36) NOT NULL,
	`ad_set_id` varchar(36) NOT NULL,
	`external_id` varchar(40) NOT NULL,
	`name` varchar(300) NOT NULL,
	`status` varchar(30),
	`effective_status` varchar(30),
	`synced_at` datetime(3) NOT NULL,
	CONSTRAINT `ads_id` PRIMARY KEY(`id`),
	CONSTRAINT `ads_set_ext_uq` UNIQUE(`ad_set_id`,`external_id`)
);
--> statement-breakpoint
CREATE TABLE `campaigns` (
	`id` varchar(36) NOT NULL,
	`organization_id` varchar(36) NOT NULL,
	`ad_account_id` varchar(36) NOT NULL,
	`external_id` varchar(40) NOT NULL,
	`name` varchar(300) NOT NULL,
	`objective` varchar(60),
	`status` varchar(30),
	`effective_status` varchar(30),
	`daily_budget` decimal(14,2),
	`lifetime_budget` decimal(14,2),
	`start_time` datetime(3),
	`stop_time` datetime(3),
	`synced_at` datetime(3) NOT NULL,
	CONSTRAINT `campaigns_id` PRIMARY KEY(`id`),
	CONSTRAINT `campaigns_acct_ext_uq` UNIQUE(`ad_account_id`,`external_id`)
);
--> statement-breakpoint
CREATE TABLE `insights_daily` (
	`campaign_id` varchar(36) NOT NULL,
	`date` varchar(10) NOT NULL,
	`organization_id` varchar(36) NOT NULL,
	`ad_account_id` varchar(36) NOT NULL,
	`spend` decimal(14,2),
	`impressions` bigint,
	`reach` bigint,
	`clicks` bigint,
	`results` bigint,
	`result_type` varchar(60),
	`purchase_value` decimal(14,2),
	`synced_at` datetime(3) NOT NULL,
	CONSTRAINT `insights_daily_campaign_id_date_pk` PRIMARY KEY(`campaign_id`,`date`)
);
--> statement-breakpoint
CREATE TABLE `meta_connections` (
	`id` varchar(36) NOT NULL,
	`organization_id` varchar(36) NOT NULL,
	`mode` enum('demo','meta') NOT NULL,
	`status` enum('active','needs_reconnect','revoked','error') NOT NULL DEFAULT 'active',
	`meta_user_id` varchar(40),
	`token_enc` text,
	`token_expires_at` datetime(3),
	`granted_scopes` json,
	`last_error` varchar(300),
	`connected_by` varchar(36),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `meta_connections_id` PRIMARY KEY(`id`),
	CONSTRAINT `meta_conn_org_uq` UNIQUE(`organization_id`)
);
--> statement-breakpoint
CREATE TABLE `sync_runs` (
	`id` varchar(36) NOT NULL,
	`organization_id` varchar(36) NOT NULL,
	`ad_account_id` varchar(36) NOT NULL,
	`status` enum('running','success','partial','failed','interrupted') NOT NULL,
	`trigger_type` enum('manual','scheduled') NOT NULL,
	`lock_key` varchar(36),
	`started_at` datetime(3) NOT NULL,
	`heartbeat_at` datetime(3) NOT NULL,
	`finished_at` datetime(3),
	`range_since` varchar(10) NOT NULL,
	`range_until` varchar(10) NOT NULL,
	`attempts` int NOT NULL DEFAULT 1,
	`counts` json,
	`error_code` varchar(40),
	`error_message` varchar(300),
	CONSTRAINT `sync_runs_id` PRIMARY KEY(`id`),
	CONSTRAINT `sync_runs_lock_uq` UNIQUE(`lock_key`)
);
--> statement-breakpoint
ALTER TABLE `ad_accounts` ADD CONSTRAINT `ad_accounts_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ad_accounts` ADD CONSTRAINT `ad_accounts_connection_id_meta_connections_id_fk` FOREIGN KEY (`connection_id`) REFERENCES `meta_connections`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ad_accounts` ADD CONSTRAINT `ad_accounts_client_id_clients_id_fk` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ad_sets` ADD CONSTRAINT `ad_sets_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ad_sets` ADD CONSTRAINT `ad_sets_campaign_id_campaigns_id_fk` FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ads` ADD CONSTRAINT `ads_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ads` ADD CONSTRAINT `ads_ad_set_id_ad_sets_id_fk` FOREIGN KEY (`ad_set_id`) REFERENCES `ad_sets`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `campaigns` ADD CONSTRAINT `campaigns_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `campaigns` ADD CONSTRAINT `campaigns_ad_account_id_ad_accounts_id_fk` FOREIGN KEY (`ad_account_id`) REFERENCES `ad_accounts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `insights_daily` ADD CONSTRAINT `insights_daily_campaign_id_campaigns_id_fk` FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `meta_connections` ADD CONSTRAINT `meta_connections_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sync_runs` ADD CONSTRAINT `sync_runs_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sync_runs` ADD CONSTRAINT `sync_runs_ad_account_id_ad_accounts_id_fk` FOREIGN KEY (`ad_account_id`) REFERENCES `ad_accounts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `ad_accounts_client_idx` ON `ad_accounts` (`client_id`);--> statement-breakpoint
CREATE INDEX `ad_sets_org_idx` ON `ad_sets` (`organization_id`);--> statement-breakpoint
CREATE INDEX `ads_org_idx` ON `ads` (`organization_id`);--> statement-breakpoint
CREATE INDEX `campaigns_org_idx` ON `campaigns` (`organization_id`);--> statement-breakpoint
CREATE INDEX `insights_org_date_idx` ON `insights_daily` (`organization_id`,`date`);--> statement-breakpoint
CREATE INDEX `insights_acct_date_idx` ON `insights_daily` (`ad_account_id`,`date`);--> statement-breakpoint
CREATE INDEX `sync_runs_acct_idx` ON `sync_runs` (`ad_account_id`,`started_at`);