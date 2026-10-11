CREATE TABLE `notification_recipients` (
	`id` varchar(36) NOT NULL,
	`organization_id` varchar(36) NOT NULL,
	`channel` enum('whatsapp') NOT NULL DEFAULT 'whatsapp',
	`name` varchar(80) NOT NULL,
	`phone` varchar(20) NOT NULL,
	`min_severity` enum('info','warning','critical') NOT NULL DEFAULT 'critical',
	`active` boolean NOT NULL DEFAULT true,
	`created_by` varchar(36) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `notification_recipients_id` PRIMARY KEY(`id`),
	CONSTRAINT `recipients_org_phone_uq` UNIQUE(`organization_id`,`channel`,`phone`)
);
--> statement-breakpoint
CREATE TABLE `outbox` (
	`id` varchar(36) NOT NULL,
	`organization_id` varchar(36) NOT NULL,
	`channel` enum('whatsapp') NOT NULL,
	`recipient_id` varchar(36) NOT NULL,
	`idempotency_key` varchar(120) NOT NULL,
	`body` varchar(1000) NOT NULL,
	`status` enum('pending','sending','sent','failed','blocked','uncertain') NOT NULL DEFAULT 'pending',
	`attempts` int NOT NULL DEFAULT 0,
	`last_error` varchar(300),
	`provider_message_id` varchar(100),
	`next_attempt_at` datetime(3),
	`sent_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `outbox_id` PRIMARY KEY(`id`),
	CONSTRAINT `outbox_idem_uq` UNIQUE(`organization_id`,`idempotency_key`)
);
--> statement-breakpoint
ALTER TABLE `notification_recipients` ADD CONSTRAINT `notification_recipients_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `outbox` ADD CONSTRAINT `outbox_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `outbox` ADD CONSTRAINT `outbox_recipient_id_notification_recipients_id_fk` FOREIGN KEY (`recipient_id`) REFERENCES `notification_recipients`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `outbox_status_idx` ON `outbox` (`status`,`next_attempt_at`);