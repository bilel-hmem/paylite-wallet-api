import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { bigintTransformer } from '../../common/utils/money';
import { User } from '../users/user.entity';

export enum WalletStatus {
  ACTIVE = 'ACTIVE',
  FROZEN = 'FROZEN',
}

@Entity('wallets')
export class Wallet {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id' })
  userId: number;

  @OneToOne(() => User, (user) => user.wallet)
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'FK_wallets_user' })
  user?: User;

  /** Balance in millimes. A CHECK constraint in the migration forbids negative values. */
  @Column({ type: 'bigint', default: 0, transformer: bigintTransformer })
  balance: number;

  @Column({ type: 'char', length: 3, default: 'TND' })
  currency: string;

  @Column({ type: 'enum', enum: WalletStatus, default: WalletStatus.ACTIVE })
  status: WalletStatus;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
