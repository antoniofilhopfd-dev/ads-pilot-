CREATE TABLE `organization_logos` (
	`organization_id` varchar(36) NOT NULL,
	`mime` enum('image/png','image/jpeg') NOT NULL,
	`data` mediumblob NOT NULL,
	`width` int NOT NULL,
	`height` int NOT NULL,
	`bytes` int NOT NULL,
	`sha256` varchar(64) NOT NULL,
	`updated_by` varchar(36),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `organization_logos_organization_id` PRIMARY KEY(`organization_id`)
);
--> statement-breakpoint
ALTER TABLE `organization_logos` ADD CONSTRAINT `organization_logos_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;