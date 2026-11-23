import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { bigintTransformer } from '../../common/utils/money';
import { Wallet } from '../wallets/wallet.entity';
import { LedgerEntry } from './ledger-entry.entity';

export enum TransactionType {
  DEPOSIT = 'DEPOSIT',
  TRANSFER = 'TRANSFER',
}

@Entity('transactions')
@Index('UQ_transactions_reference', ['reference'], { unique: true })
@Index('UQ_transactions_idempotency', ['fromWalletId', 'idempotencyKey'], { unique: true })
@Index('IDX_transactions_from_wallet_created', ['fromWalletId', 'createdAt'])
@Index('IDX_transactions_to_wallet_created', ['toWalletId', 'createdAt'])
export class Transaction {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 32 })
  reference: string;

  @Column({ type: 'enum', enum: TransactionType })
  type: TransactionType;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  amount: number;

  /** NULL for deposits (money comes from outside the system). */
  @Column({ name: 'from_wallet_id', type: 'int', nullable: true })
  fromWalletId: number | null;

  @ManyToOne(() => Wallet, { nullable: true })
  @JoinColumn({ name: 'from_wallet_id', foreignKeyConstraintName: 'FK_transactions_from_wallet' })
  fromWallet?: Wallet | null;

  @Column({ name: 'to_wallet_id' })
  toWalletId: number;

  @ManyToOne(() => Wallet)
  @JoinColumn({ name: 'to_wallet_id', foreignKeyConstraintName: 'FK_transactions_to_wallet' })
  toWallet?: Wallet;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 64, nullable: true })
  idempotencyKey: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description: string | null;

  @OneToMany(() => LedgerEntry, (entry) => entry.transaction)
  entries?: LedgerEntry[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
