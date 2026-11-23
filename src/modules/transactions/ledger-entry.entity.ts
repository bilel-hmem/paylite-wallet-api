import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { bigintTransformer } from '../../common/utils/money';
import { Wallet } from '../wallets/wallet.entity';
import { Transaction } from './transaction.entity';

export enum EntryDirection {
  DEBIT = 'DEBIT',
  CREDIT = 'CREDIT',
}

/**
 * Double-entry ledger: every money movement is recorded per wallet.
 * The sum of a wallet's CREDITs minus DEBITs must always equal its balance
 * (checked by GET /admin/reconcile).
 */
@Entity('ledger_entries')
@Index('IDX_ledger_entries_transaction', ['transactionId'])
@Index('IDX_ledger_entries_wallet_created', ['walletId', 'createdAt'])
export class LedgerEntry {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'transaction_id' })
  transactionId: number;

  @ManyToOne(() => Transaction, (transaction) => transaction.entries)
  @JoinColumn({ name: 'transaction_id', foreignKeyConstraintName: 'FK_ledger_entries_transaction' })
  transaction?: Transaction;

  @Column({ name: 'wallet_id' })
  walletId: number;

  @ManyToOne(() => Wallet)
  @JoinColumn({ name: 'wallet_id', foreignKeyConstraintName: 'FK_ledger_entries_wallet' })
  wallet?: Wallet;

  @Column({ type: 'enum', enum: EntryDirection })
  direction: EntryDirection;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  amount: number;

  @Column({ name: 'balance_after', type: 'bigint', transformer: bigintTransformer })
  balanceAfter: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
