import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { formatMillimes } from '../../common/utils/money';
import { paginate, Paginated, skipFor } from '../../common/utils/paginate';
import { generateReference } from '../../common/utils/reference';
import { EntryDirection, LedgerEntry } from '../transactions/ledger-entry.entity';
import { Transaction, TransactionType } from '../transactions/transaction.entity';
import { AdminWalletQueryDto } from './dto/admin-wallet-query.dto';
import { DepositDto } from './dto/deposit.dto';
import { Wallet, WalletStatus } from './wallet.entity';
import { AdminWalletView, toAdminWalletView, toWalletView, WalletView } from './wallet.view';

export interface DepositResult {
  reference: string;
  amount: number;
  amountFormatted: string;
  balanceAfter: number;
  createdAt: Date;
}

@Injectable()
export class WalletsService {
  constructor(
    @InjectRepository(Wallet) private readonly wallets: Repository<Wallet>,
    private readonly dataSource: DataSource,
  ) {}

  async findByUserId(userId: number): Promise<Wallet> {
    const wallet = await this.wallets.findOne({ where: { userId } });
    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }
    return wallet;
  }

  async getMyWallet(userId: number): Promise<WalletView> {
    return toWalletView(await this.findByUserId(userId));
  }

  /**
   * Simulated top-up (a real system would call a payment provider first).
   * The row lock makes a deposit and a concurrent transfer on the same wallet safe.
   */
  async deposit(userId: number, dto: DepositDto): Promise<DepositResult> {
    return this.dataSource.transaction(async (manager) => {
      const wallet = await manager.findOne(Wallet, {
        where: { userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!wallet) {
        throw new NotFoundException('Wallet not found');
      }
      if (wallet.status !== WalletStatus.ACTIVE) {
        throw new ForbiddenException('Your wallet is frozen');
      }

      const balanceAfter = wallet.balance + dto.amount;
      await manager.update(Wallet, wallet.id, { balance: balanceAfter });

      const transaction = await manager.save(
        manager.create(Transaction, {
          reference: generateReference(),
          type: TransactionType.DEPOSIT,
          amount: dto.amount,
          fromWalletId: null,
          toWalletId: wallet.id,
          idempotencyKey: null,
          description: dto.description ?? 'Wallet top-up',
        }),
      );
      await manager.save(
        manager.create(LedgerEntry, {
          transactionId: transaction.id,
          walletId: wallet.id,
          direction: EntryDirection.CREDIT,
          amount: dto.amount,
          balanceAfter,
        }),
      );

      return {
        reference: transaction.reference,
        amount: dto.amount,
        amountFormatted: formatMillimes(dto.amount),
        balanceAfter,
        createdAt: transaction.createdAt,
      };
    });
  }

  async listAll(query: AdminWalletQueryDto): Promise<Paginated<AdminWalletView>> {
    const qb = this.wallets.createQueryBuilder('w').leftJoinAndSelect('w.user', 'u');
    if (query.status) {
      qb.andWhere('w.status = :status', { status: query.status });
    }
    if (query.email) {
      qb.andWhere('u.email LIKE :email', { email: `%${query.email}%` });
    }
    const [wallets, total] = await qb
      .orderBy('w.createdAt', query.order)
      .addOrderBy('w.id', query.order)
      .skip(skipFor(query.page, query.limit))
      .take(query.limit)
      .getManyAndCount();
    return paginate(wallets.map(toAdminWalletView), total, query.page, query.limit);
  }

  async updateStatus(walletId: number, status: WalletStatus): Promise<AdminWalletView> {
    const wallet = await this.wallets.findOne({
      where: { id: walletId },
      relations: { user: true },
    });
    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }
    await this.wallets.update(wallet.id, { status });
    wallet.status = status;
    return toAdminWalletView(wallet);
  }
}
