CREATE TABLE `member_account_access` (
	`organization_id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`ad_account_id` varchar(36) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `member_acct_access_pk` PRIMARY KEY(`organization_id`,`user_id`,`ad_account_id`)
);
--> statement-breakpoint
ALTER TABLE `memberships` ADD `access_scope` enum('all','restricted') DEFAULT 'all' NOT NULL;--> statement-breakpoint
ALTER TABLE `member_account_access` ADD CONSTRAINT `member_account_access_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `member_account_access` ADD CONSTRAINT `member_account_access_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `member_account_access` ADD CONSTRAINT `member_account_access_ad_account_id_ad_accounts_id_fk` FOREIGN KEY (`ad_account_id`) REFERENCES `ad_accounts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `member_acct_access_acct_idx` ON `member_account_access` (`ad_account_id`);