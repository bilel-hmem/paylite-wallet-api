import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Initial schema. Money columns are BIGINT millimes (1 TND = 1000 millimes).
 *
 * The CHECK constraints are a last line of defence: even if application code had a bug,
 * MySQL (8.0.16+) would refuse a negative balance. TypeORM does not manage CHECK
 * constraints on MySQL, so they live only here and `migration:generate` ignores them.
 */
export class InitialSchema1795392000000 implements MigrationInterface {
  name = 'InitialSchema1795392000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`users\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`full_name\` varchar(100) NOT NULL,
        \`email\` varchar(180) NOT NULL,
        \`password_hash\` varchar(255) NOT NULL,
        \`role\` enum ('USER', 'ADMIN') NOT NULL DEFAULT 'USER',
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        UNIQUE INDEX \`UQ_users_email\` (\`email\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    await queryRunner.query(`
      CREATE TABLE \`wallets\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`user_id\` int NOT NULL,
        \`balance\` bigint NOT NULL DEFAULT '0',
        \`currency\` char(3) NOT NULL DEFAULT 'TND',
        \`status\` enum ('ACTIVE', 'FROZEN') NOT NULL DEFAULT 'ACTIVE',
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        UNIQUE INDEX \`REL_92558c08091598f7a4439586cd\` (\`user_id\`),
        CONSTRAINT \`CHK_wallets_balance_non_negative\` CHECK (\`balance\` >= 0),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    await queryRunner.query(`
      CREATE TABLE \`transactions\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`reference\` varchar(32) NOT NULL,
        \`type\` enum ('DEPOSIT', 'TRANSFER') NOT NULL,
        \`amount\` bigint NOT NULL,
        \`from_wallet_id\` int NULL,
        \`to_wallet_id\` int NOT NULL,
        \`idempotency_key\` varchar(64) NULL,
        \`description\` varchar(255) NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        UNIQUE INDEX \`UQ_transactions_reference\` (\`reference\`),
        UNIQUE INDEX \`UQ_transactions_idempotency\` (\`from_wallet_id\`, \`idempotency_key\`),
        INDEX \`IDX_transactions_from_wallet_created\` (\`from_wallet_id\`, \`created_at\`),
        INDEX \`IDX_transactions_to_wallet_created\` (\`to_wallet_id\`, \`created_at\`),
        CONSTRAINT \`CHK_transactions_amount_positive\` CHECK (\`amount\` > 0),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    await queryRunner.query(`
      CREATE TABLE \`ledger_entries\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`transaction_id\` int NOT NULL,
        \`wallet_id\` int NOT NULL,
        \`direction\` enum ('DEBIT', 'CREDIT') NOT NULL,
        \`amount\` bigint NOT NULL,
        \`balance_after\` bigint NOT NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        INDEX \`IDX_ledger_entries_transaction\` (\`transaction_id\`),
        INDEX \`IDX_ledger_entries_wallet_created\` (\`wallet_id\`, \`created_at\`),
        CONSTRAINT \`CHK_ledger_entries_amount_positive\` CHECK (\`amount\` > 0),
        CONSTRAINT \`CHK_ledger_entries_balance_non_negative\` CHECK (\`balance_after\` >= 0),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    await queryRunner.query(
      'ALTER TABLE `wallets` ADD CONSTRAINT `FK_wallets_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE `transactions` ADD CONSTRAINT `FK_transactions_from_wallet` FOREIGN KEY (`from_wallet_id`) REFERENCES `wallets`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE `transactions` ADD CONSTRAINT `FK_transactions_to_wallet` FOREIGN KEY (`to_wallet_id`) REFERENCES `wallets`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE `ledger_entries` ADD CONSTRAINT `FK_ledger_entries_transaction` FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE `ledger_entries` ADD CONSTRAINT `FK_ledger_entries_wallet` FOREIGN KEY (`wallet_id`) REFERENCES `wallets`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `ledger_entries` DROP FOREIGN KEY `FK_ledger_entries_wallet`',
    );
    await queryRunner.query(
      'ALTER TABLE `ledger_entries` DROP FOREIGN KEY `FK_ledger_entries_transaction`',
    );
    await queryRunner.query(
      'ALTER TABLE `transactions` DROP FOREIGN KEY `FK_transactions_to_wallet`',
    );
    await queryRunner.query(
      'ALTER TABLE `transactions` DROP FOREIGN KEY `FK_transactions_from_wallet`',
    );
    await queryRunner.query('ALTER TABLE `wallets` DROP FOREIGN KEY `FK_wallets_user`');
    await queryRunner.query('DROP TABLE `ledger_entries`');
    await queryRunner.query('DROP TABLE `transactions`');
    await queryRunner.query('DROP TABLE `wallets`');
    await queryRunner.query('DROP TABLE `users`');
  }
}
