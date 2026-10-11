CREATE TABLE `mcp_tokens` (
	`id` varchar(36) NOT NULL,
	`organization_id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`name` varchar(80) NOT NULL,
	`token_hash` varchar(64) NOT NULL,
	`token_prefix` varchar(16) NOT NULL,
	`scopes` json NOT NULL,
	`expires_at` datetime(3) NOT NULL,
	`last_used_at` datetime(3),
	`revoked_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `mcp_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `mcp_tokens_hash_uq` UNIQUE(`token_hash`)
);
--> statement-breakpoint
ALTER TABLE `operations` ADD `origin` enum('web','mcp') DEFAULT 'web' NOT NULL;--> statement-breakpoint
ALTER TABLE `operations` ADD `mcp_token_id` varchar(36);--> statement-breakpoint
ALTER TABLE `operations` ADD `client_request_id` varchar(64);--> statement-breakpoint
ALTER TABLE `operations` ADD `confirmation_code_hash` varchar(64);--> statement-breakpoint
ALTER TABLE `operations` ADD `confirmation_expires_at` datetime(3);--> statement-breakpoint
ALTER TABLE `operations` ADD `confirmation_attempts` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `operations` ADD CONSTRAINT `operations_client_req_uq` UNIQUE(`organization_id`,`client_request_id`);--> statement-breakpoint
ALTER TABLE `mcp_tokens` ADD CONSTRAINT `mcp_tokens_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mcp_tokens` ADD CONSTRAINT `mcp_tokens_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `mcp_tokens_org_idx` ON `mcp_tokens` (`organization_id`);