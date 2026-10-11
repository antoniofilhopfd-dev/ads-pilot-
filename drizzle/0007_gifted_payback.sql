CREATE TABLE `audience_versions` (
	`audience_id` varchar(36) NOT NULL,
	`version` int NOT NULL,
	`organization_id` varchar(36) NOT NULL,
	`config` json NOT NULL,
	`note` varchar(300),
	`changed_by` varchar(36) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `audience_versions_pk` PRIMARY KEY(`audience_id`,`version`)
);
--> statement-breakpoint
CREATE TABLE `audiences` (
	`id` varchar(36) NOT NULL,
	`organization_id` varchar(36) NOT NULL,
	`client_id` varchar(36),
	`folder_id` varchar(36),
	`name` varchar(120) NOT NULL,
	`objective` varchar(40),
	`config` json NOT NULL,
	`reach_estimate` json,
	`version` int NOT NULL DEFAULT 1,
	`archived` boolean NOT NULL DEFAULT false,
	`created_by` varchar(36) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `audiences_id` PRIMARY KEY(`id`),
	CONSTRAINT `audiences_org_name_uq` UNIQUE(`organization_id`,`name`)
);
--> statement-breakpoint
CREATE TABLE `budget_plans` (
	`id` varchar(36) NOT NULL,
	`organization_id` varchar(36) NOT NULL,
	`scope` enum('client','account','campaign') NOT NULL,
	`scope_id` varchar(36) NOT NULL,
	`period` varchar(7) NOT NULL,
	`amount` decimal(14,2) NOT NULL,
	`currency` varchar(3) NOT NULL DEFAULT 'BRL',
	`milestones` json NOT NULL,
	`note` varchar(300),
	`created_by` varchar(36) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `budget_plans_id` PRIMARY KEY(`id`),
	CONSTRAINT `budget_plans_uq` UNIQUE(`organization_id`,`scope`,`scope_id`,`period`)
);
--> statement-breakpoint
CREATE TABLE `campaign_drafts` (
	`id` varchar(36) NOT NULL,
	`organization_id` varchar(36) NOT NULL,
	`client_id` varchar(36),
	`ad_account_id` varchar(36),
	`folder_id` varchar(36),
	`name` varchar(200) NOT NULL,
	`step` int NOT NULL DEFAULT 1,
	`data` json NOT NULL,
	`status` enum('draft','ready','archived') NOT NULL DEFAULT 'draft',
	`issues` json NOT NULL,
	`created_by` varchar(36) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `campaign_drafts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `checklist_runs` (
	`id` varchar(36) NOT NULL,
	`organization_id` varchar(36) NOT NULL,
	`template_key` varchar(40) NOT NULL,
	`target_type` enum('campaign','draft','account','client') NOT NULL,
	`target_id` varchar(36) NOT NULL,
	`items` json NOT NULL,
	`completed_at` datetime(3),
	`created_by` varchar(36) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `checklist_runs_id` PRIMARY KEY(`id`),
	CONSTRAINT `checklist_runs_uq` UNIQUE(`organization_id`,`template_key`,`target_type`,`target_id`)
);
--> statement-breakpoint
CREATE TABLE `creative_assets` (
	`id` varchar(36) NOT NULL,
	`organization_id` varchar(36) NOT NULL,
	`mime` enum('image/png','image/jpeg') NOT NULL,
	`data` mediumblob NOT NULL,
	`width` int NOT NULL,
	`height` int NOT NULL,
	`bytes` int NOT NULL,
	`sha256` varchar(64) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `creative_assets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `creative_links` (
	`id` varchar(36) NOT NULL,
	`organization_id` varchar(36) NOT NULL,
	`creative_id` varchar(36) NOT NULL,
	`campaign_id` varchar(36),
	`ad_id` varchar(36),
	`link_key` varchar(80) NOT NULL,
	`used_from` varchar(10),
	`note` varchar(300),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `creative_links_id` PRIMARY KEY(`id`),
	CONSTRAINT `creative_links_uq` UNIQUE(`creative_id`,`link_key`)
);
--> statement-breakpoint
CREATE TABLE `creatives` (
	`id` varchar(36) NOT NULL,
	`organization_id` varchar(36) NOT NULL,
	`client_id` varchar(36),
	`folder_id` varchar(36),
	`asset_id` varchar(36),
	`name` varchar(120) NOT NULL,
	`format` enum('image','video','text') NOT NULL,
	`video_url` varchar(500),
	`primary_text` text,
	`headline` varchar(120),
	`description` varchar(200),
	`cta` varchar(40),
	`url` varchar(1000),
	`variants` json NOT NULL,
	`notes` text,
	`status` enum('draft','active','archived') NOT NULL DEFAULT 'draft',
	`created_by` varchar(36) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `creatives_id` PRIMARY KEY(`id`),
	CONSTRAINT `creatives_org_name_uq` UNIQUE(`organization_id`,`name`)
);
--> statement-breakpoint
CREATE TABLE `entity_labels` (
	`organization_id` varchar(36) NOT NULL,
	`label_id` varchar(36) NOT NULL,
	`entity_type` enum('creative','audience','draft','campaign','experiment','utm') NOT NULL,
	`entity_id` varchar(36) NOT NULL,
	CONSTRAINT `entity_labels_pk` PRIMARY KEY(`label_id`,`entity_type`,`entity_id`)
);
--> statement-breakpoint
CREATE TABLE `experiments` (
	`id` varchar(36) NOT NULL,
	`organization_id` varchar(36) NOT NULL,
	`client_id` varchar(36),
	`folder_id` varchar(36),
	`name` varchar(150) NOT NULL,
	`hypothesis` text NOT NULL,
	`objective` varchar(200) NOT NULL,
	`variable` varchar(150) NOT NULL,
	`primary_metric` enum('ctr','cpa','cpl','roas','cpc','conversion_rate') NOT NULL,
	`guard_metrics` json NOT NULL,
	`budget` decimal(14,2),
	`starts_on` varchar(10),
	`ends_on` varchar(10),
	`status` enum('planned','running','concluded','cancelled') NOT NULL DEFAULT 'planned',
	`variants` json NOT NULL,
	`conclusion` text,
	`next_action` varchar(300),
	`created_by` varchar(36) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `experiments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `folders` (
	`id` varchar(36) NOT NULL,
	`organization_id` varchar(36) NOT NULL,
	`kind` enum('creative','audience','draft','campaign','experiment') NOT NULL,
	`name` varchar(80) NOT NULL,
	`color` varchar(12) NOT NULL DEFAULT 'violet',
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `folders_id` PRIMARY KEY(`id`),
	CONSTRAINT `folders_org_kind_name_uq` UNIQUE(`organization_id`,`kind`,`name`)
);
--> statement-breakpoint
CREATE TABLE `goals` (
	`id` varchar(36) NOT NULL,
	`organization_id` varchar(36) NOT NULL,
	`scope` enum('org','client','account','campaign') NOT NULL,
	`scope_id` varchar(36) NOT NULL DEFAULT '',
	`metric` enum('cpa','cpl','roas','ctr','cpc','cpm','spend','results') NOT NULL,
	`direction` enum('max','min') NOT NULL,
	`target` decimal(14,4) NOT NULL,
	`window_days` int NOT NULL DEFAULT 30,
	`note` varchar(300),
	`created_by` varchar(36) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `goals_id` PRIMARY KEY(`id`),
	CONSTRAINT `goals_uq` UNIQUE(`organization_id`,`scope`,`scope_id`,`metric`)
);
--> statement-breakpoint
CREATE TABLE `labels` (
	`id` varchar(36) NOT NULL,
	`organization_id` varchar(36) NOT NULL,
	`name` varchar(40) NOT NULL,
	`color` varchar(12) NOT NULL DEFAULT 'sky',
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `labels_id` PRIMARY KEY(`id`),
	CONSTRAINT `labels_org_name_uq` UNIQUE(`organization_id`,`name`)
);
--> statement-breakpoint
CREATE TABLE `utm_links` (
	`id` varchar(36) NOT NULL,
	`organization_id` varchar(36) NOT NULL,
	`client_id` varchar(36),
	`campaign_id` varchar(36),
	`creative_id` varchar(36),
	`base_url` varchar(1000) NOT NULL,
	`params` json NOT NULL,
	`final_url` varchar(2000) NOT NULL,
	`created_by` varchar(36) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `utm_links_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `utm_templates` (
	`id` varchar(36) NOT NULL,
	`organization_id` varchar(36) NOT NULL,
	`name` varchar(80) NOT NULL,
	`source` varchar(100) NOT NULL,
	`medium` varchar(100) NOT NULL,
	`campaign_pattern` varchar(200) NOT NULL,
	`content_pattern` varchar(200),
	`term_pattern` varchar(200),
	`created_by` varchar(36) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `utm_templates_id` PRIMARY KEY(`id`),
	CONSTRAINT `utm_templates_uq` UNIQUE(`organization_id`,`name`)
);
--> statement-breakpoint
ALTER TABLE `ad_sets` ADD `bid_strategy` varchar(40);--> statement-breakpoint
ALTER TABLE `ad_sets` ADD `start_time` datetime(3);--> statement-breakpoint
ALTER TABLE `ad_sets` ADD `end_time` datetime(3);--> statement-breakpoint
ALTER TABLE `ad_sets` ADD `targeting` json;--> statement-breakpoint
ALTER TABLE `audience_versions` ADD CONSTRAINT `audience_versions_audience_id_audiences_id_fk` FOREIGN KEY (`audience_id`) REFERENCES `audiences`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `audiences` ADD CONSTRAINT `audiences_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `audiences` ADD CONSTRAINT `audiences_client_id_clients_id_fk` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `audiences` ADD CONSTRAINT `audiences_folder_id_folders_id_fk` FOREIGN KEY (`folder_id`) REFERENCES `folders`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `budget_plans` ADD CONSTRAINT `budget_plans_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `campaign_drafts` ADD CONSTRAINT `campaign_drafts_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `campaign_drafts` ADD CONSTRAINT `campaign_drafts_client_id_clients_id_fk` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `campaign_drafts` ADD CONSTRAINT `campaign_drafts_ad_account_id_ad_accounts_id_fk` FOREIGN KEY (`ad_account_id`) REFERENCES `ad_accounts`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `campaign_drafts` ADD CONSTRAINT `campaign_drafts_folder_id_folders_id_fk` FOREIGN KEY (`folder_id`) REFERENCES `folders`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `checklist_runs` ADD CONSTRAINT `checklist_runs_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `creative_assets` ADD CONSTRAINT `creative_assets_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `creative_links` ADD CONSTRAINT `creative_links_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `creative_links` ADD CONSTRAINT `creative_links_creative_id_creatives_id_fk` FOREIGN KEY (`creative_id`) REFERENCES `creatives`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `creative_links` ADD CONSTRAINT `creative_links_campaign_id_campaigns_id_fk` FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `creative_links` ADD CONSTRAINT `creative_links_ad_id_ads_id_fk` FOREIGN KEY (`ad_id`) REFERENCES `ads`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `creatives` ADD CONSTRAINT `creatives_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `creatives` ADD CONSTRAINT `creatives_client_id_clients_id_fk` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `creatives` ADD CONSTRAINT `creatives_folder_id_folders_id_fk` FOREIGN KEY (`folder_id`) REFERENCES `folders`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `creatives` ADD CONSTRAINT `creatives_asset_id_creative_assets_id_fk` FOREIGN KEY (`asset_id`) REFERENCES `creative_assets`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `entity_labels` ADD CONSTRAINT `entity_labels_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `entity_labels` ADD CONSTRAINT `entity_labels_label_id_labels_id_fk` FOREIGN KEY (`label_id`) REFERENCES `labels`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `experiments` ADD CONSTRAINT `experiments_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `experiments` ADD CONSTRAINT `experiments_client_id_clients_id_fk` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `experiments` ADD CONSTRAINT `experiments_folder_id_folders_id_fk` FOREIGN KEY (`folder_id`) REFERENCES `folders`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `folders` ADD CONSTRAINT `folders_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `goals` ADD CONSTRAINT `goals_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `labels` ADD CONSTRAINT `labels_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `utm_links` ADD CONSTRAINT `utm_links_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `utm_links` ADD CONSTRAINT `utm_links_client_id_clients_id_fk` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `utm_links` ADD CONSTRAINT `utm_links_campaign_id_campaigns_id_fk` FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `utm_links` ADD CONSTRAINT `utm_links_creative_id_creatives_id_fk` FOREIGN KEY (`creative_id`) REFERENCES `creatives`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `utm_templates` ADD CONSTRAINT `utm_templates_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `audiences_client_idx` ON `audiences` (`client_id`);--> statement-breakpoint
CREATE INDEX `drafts_org_idx` ON `campaign_drafts` (`organization_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `creatives_client_idx` ON `creatives` (`client_id`);--> statement-breakpoint
CREATE INDEX `entity_labels_entity_idx` ON `entity_labels` (`organization_id`,`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `experiments_org_idx` ON `experiments` (`organization_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `utm_links_org_idx` ON `utm_links` (`organization_id`,`created_at`);