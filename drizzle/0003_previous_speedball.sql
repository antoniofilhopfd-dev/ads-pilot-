CREATE TABLE `report_exports` (
	`id` varchar(36) NOT NULL,
	`organization_id` varchar(36) NOT NULL,
	`user_id` varchar(36),
	`report_type` varchar(30) NOT NULL,
	`format` enum('pdf','xlsx','csv') NOT NULL,
	`config` json NOT NULL,
	`filename` varchar(200) NOT NULL,
	`bytes` int NOT NULL,
	`sha256` varchar(64) NOT NULL,
	`verified` boolean NOT NULL,
	`verification` json NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `report_exports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `report_templates` (
	`id` varchar(36) NOT NULL,
	`organization_id` varchar(36) NOT NULL,
	`name` varchar(120) NOT NULL,
	`config` json NOT NULL,
	`created_by` varchar(36) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `report_templates_id` PRIMARY KEY(`id`),
	CONSTRAINT `report_templates_org_name_uq` UNIQUE(`organization_id`,`name`)
);
--> statement-breakpoint
ALTER TABLE `report_exports` ADD CONSTRAINT `report_exports_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `report_templates` ADD CONSTRAINT `report_templates_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `report_exports_org_idx` ON `report_exports` (`organization_id`,`created_at`);