import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { AuthUser } from '../../common/interfaces/auth-user.interface';
import { startOfDay } from '../../common/utils/date';
import { formatMillimes } from '../../common/utils/money';
import { generateReference } from '../../common/utils/reference';
import { EntryDirection, LedgerEntry } from '../transactions/ledger-entry.entity';
import { Transaction, TransactionType } from '../transactions/transaction.entity';
import { User } from '../users/user.entity';
import { Wallet } from '../wallets/wallet.entity';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { assertTransferAllowed } from './transfer-rules';

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

export interface TransferView {
  reference: string;
  amount: number;
  amountFormatted: string;
  recipient: { fullName: string; email: string };
  description: string | null;
  senderBalanceAfter: number | null;
  createdAt: Date;
}

export interface TransferOutcome {
  /** true when the Idempotency-Key matched an earlier transfer and nothing new was created. */
  replayed: boolean;
  transfer: TransferView;
}

@Injectable()
export class TransfersService {
  private readonly dailyLimit: number;

  constructor(
    @InjectRepository(Wallet) private readonly wallets: Repository<Wallet>,
    private readonly dataSource: DataSource,
    config: ConfigService,
  ) {
    this.dailyLimit = config.get<number>('DAILY_TRANSFER_LIMIT', 2_000_000);
  }

  /**
   * Moves money between two wallets.
   *
   * 1. Both wallet rows are locked (SELECT ... FOR UPDATE), always lowest id first,
   *    so two opposite transfers can never deadlock each other.
   * 2. While the sender is locked, transfers from that wallet run one at a time:
   *    the balance check, the daily limit and the idempotency check cannot race.
   * 3. Balances, the transaction and two ledger entries are written in one DB transaction.
   */
  async transfer(
    sender: AuthUser,
    dto: CreateTransferDto,
    idempotencyKey?: string,
  ): Promise<TransferOutcome> {
    if (idempotencyKey !== undefined && !IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
      throw new BadRequestException(
        'Idempotency-Key must be 8-64 characters: letters, digits, "-" or "_"',
      );
    }
    if (dto.recipientEmail === sender.email) {
      throw new BadRequestException('You cannot transfer money to yourself');
    }

    const [senderWallet, recipientWallet] = await Promise.all([
      this.wallets.findOne({ where: { userId: sender.id } }),
      this.wallets.findOne({
        where: { user: { email: dto.recipientEmail } },
        relations: { user: true },
      }),
    ]);
    if (!senderWallet) {
      throw new NotFoundException('Wallet not found');
    }
    if (!recipientWallet?.user) {
      throw new NotFoundException('Recipient not found');
    }
    const recipient = recipientWallet.user;

    return this.dataSource.transaction(async (manager) => {
      const [from, to] = await this.lockWallets(manager, senderWallet.id, recipientWallet.id);

      if (idempotencyKey) {
        const previous = await manager.findOne(Transaction, {
          where: { fromWalletId: from.id, idempotencyKey },
        });
        if (previous) {
          return this.replay(manager, previous, dto, from, to, recipient);
        }
      }

      const sentToday = await this.sumSentSince(manager, from.id, startOfDay(new Date()));
      assertTransferAllowed({
        senderStatus: from.status,
        recipientStatus: to.status,
        senderBalance: from.balance,
        amount: dto.amount,
        sentToday,
        dailyLimit: this.dailyLimit,
      });

      const senderBalanceAfter = from.balance - dto.amount;
      const recipientBalanceAfter = to.balance + dto.amount;
      await manager.update(Wallet, from.id, { balance: senderBalanceAfter });
      await manager.update(Wallet, to.id, { balance: recipientBalanceAfter });

      const transaction = await manager.save(
        manager.create(Transaction, {
          reference: generateReference(),
          type: TransactionType.TRANSFER,
          amount: dto.amount,
          fromWalletId: from.id,
          toWalletId: to.id,
          idempotencyKey: idempotencyKey ?? null,
          description: dto.description ?? null,
        }),
      );
      await manager.save([
        manager.create(LedgerEntry, {
          transactionId: transaction.id,
          walletId: from.id,
          direction: EntryDirection.DEBIT,
          amount: dto.amount,
          balanceAfter: senderBalanceAfter,
        }),
        manager.create(LedgerEntry, {
          transactionId: transaction.id,
          walletId: to.id,
          direction: EntryDirection.CREDIT,
          amount: dto.amount,
          balanceAfter: recipientBalanceAfter,
        }),
      ]);

      return {
        replayed: false,
        transfer: toTransferView(transaction, recipient, senderBalanceAfter),
      };
    });
  }

  /** Locks both wallets in ascending id order and returns them as [from, to]. */
  private async lockWallets(
    manager: EntityManager,
    fromId: number,
    toId: number,
  ): Promise<[Wallet, Wallet]> {
    const lockOrder = fromId < toId ? [fromId, toId] : [toId, fromId];
    const locked = new Map<number, Wallet>();
    for (const id of lockOrder) {
      const wallet = await manager.findOne(Wallet, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!wallet) {
        throw new NotFoundException('Wallet not found');
      }
      locked.set(id, wallet);
    }
    return [locked.get(fromId) as Wallet, locked.get(toId) as Wallet];
  }

  /**
   * Same key + same request = return the original result (a retried request after a
   * network timeout must not pay twice). Same key + different request = client bug: 409.
   */
  private async replay(
    manager: EntityManager,
    previous: Transaction,
    dto: CreateTransferDto,
    from: Wallet,
    to: Wallet,
    recipient: User,
  ): Promise<TransferOutcome> {
    if (previous.amount !== dto.amount || previous.toWalletId !== to.id) {
      throw new ConflictException('Idempotency-Key was already used with a different request');
    }
    const debit = await manager.findOne(LedgerEntry, {
      where: { transactionId: previous.id, walletId: from.id, direction: EntryDirection.DEBIT },
    });
    return {
      replayed: true,
      transfer: toTransferView(previous, recipient, debit?.balanceAfter ?? null),
    };
  }

  private async sumSentSince(
    manager: EntityManager,
    walletId: number,
    since: Date,
  ): Promise<number> {
    const row = await manager
      .createQueryBuilder(Transaction, 't')
      .select('COALESCE(SUM(t.amount), 0)', 'total')
      .where('t.fromWalletId = :walletId', { walletId })
      .andWhere('t.type = :type', { type: TransactionType.TRANSFER })
      .andWhere('t.createdAt >= :since', { since })
      .getRawOne<{ total: string | number }>();
    return Number(row?.total ?? 0);
  }
}

function toTransferView(
  transaction: Transaction,
  recipient: User,
  senderBalanceAfter: number | null,
): TransferView {
  return {
    reference: transaction.reference,
    amount: transaction.amount,
    amountFormatted: formatMillimes(transaction.amount),
    recipient: { fullName: recipient.fullName, email: recipient.email },
    description: transaction.description,
    senderBalanceAfter,
    createdAt: transaction.createdAt,
  };
}
