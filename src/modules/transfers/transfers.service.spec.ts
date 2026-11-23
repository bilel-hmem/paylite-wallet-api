import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, Repository } from 'typeorm';
import { Role } from '../../common/enums/role.enum';
import { AuthUser } from '../../common/interfaces/auth-user.interface';
import { EntryDirection, LedgerEntry } from '../transactions/ledger-entry.entity';
import { Transaction, TransactionType } from '../transactions/transaction.entity';
import { User } from '../users/user.entity';
import { Wallet, WalletStatus } from '../wallets/wallet.entity';
import { TransfersService } from './transfers.service';

const alice: AuthUser = { id: 1, email: 'alice@paylite.tn', role: Role.USER };
const bob = Object.assign(new User(), { id: 2, fullName: 'Bob Trabelsi', email: 'bob@paylite.tn' });

function wallet(id: number, userId: number, balance: number): Wallet {
  return Object.assign(new Wallet(), {
    id,
    userId,
    balance,
    currency: 'TND',
    status: WalletStatus.ACTIVE,
  });
}

/** A fake EntityManager that records which wallets were locked, and in which order. */
function createManager(wallets: Wallet[], previous: Transaction | null, sentToday = '0') {
  const lockOrder: number[] = [];
  const queryBuilder = {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getRawOne: jest.fn().mockResolvedValue({ total: sentToday }),
  };
  return {
    lockOrder,
    findOne: jest.fn((entity: unknown, options: { where: Record<string, unknown> }) => {
      if (entity === Wallet) {
        const id = options.where.id as number;
        lockOrder.push(id);
        return Promise.resolve(wallets.find((w) => w.id === id) ?? null);
      }
      if (entity === Transaction) {
        return Promise.resolve(previous);
      }
      if (entity === LedgerEntry) {
        return Promise.resolve({ balanceAfter: 75_000 });
      }
      return Promise.resolve(null);
    }),
    createQueryBuilder: jest.fn(() => queryBuilder),
    update: jest.fn().mockResolvedValue(undefined),
    create: jest.fn((_entity: unknown, data: object) => ({ ...data })),
    save: jest.fn((data: unknown) =>
      Promise.resolve(
        Array.isArray(data)
          ? data
          : { id: 99, createdAt: new Date('2026-11-23T10:00:00Z'), ...(data as object) },
      ),
    ),
  };
}

describe('TransfersService', () => {
  let manager: ReturnType<typeof createManager>;
  let service: TransfersService;

  function setup(
    senderWallet: Wallet,
    recipientWallet: Wallet,
    options: { previous?: Transaction; sentToday?: string } = {},
  ) {
    recipientWallet.user = bob;
    const all = [senderWallet, recipientWallet];
    manager = createManager(all, options.previous ?? null, options.sentToday);

    const walletsRepo = {
      findOne: jest.fn((opts: { where: { userId?: number; user?: { email: string } } }) => {
        if (opts.where.userId !== undefined) {
          return Promise.resolve(all.find((w) => w.userId === opts.where.userId) ?? null);
        }
        return Promise.resolve(opts.where.user?.email === bob.email ? recipientWallet : null);
      }),
    };
    const dataSource = {
      transaction: jest.fn((work: (m: typeof manager) => unknown) => work(manager)),
    };
    const config = { get: jest.fn((_key: string, fallback: unknown) => fallback) };

    service = new TransfersService(
      walletsRepo as unknown as Repository<Wallet>,
      dataSource as unknown as DataSource,
      config as unknown as ConfigService,
    );
  }

  it('moves the money and writes a balanced pair of ledger entries', async () => {
    setup(wallet(1, 1, 100_000), wallet(2, 2, 0));

    const outcome = await service.transfer(alice, { recipientEmail: bob.email, amount: 25_000 });

    expect(outcome.replayed).toBe(false);
    expect(outcome.transfer).toMatchObject({
      amount: 25_000,
      amountFormatted: '25.000 TND',
      senderBalanceAfter: 75_000,
      recipient: { email: bob.email },
    });
    expect(manager.update).toHaveBeenCalledWith(Wallet, 1, { balance: 75_000 });
    expect(manager.update).toHaveBeenCalledWith(Wallet, 2, { balance: 25_000 });

    const entries = manager.save.mock.calls[1][0] as LedgerEntry[];
    expect(entries).toEqual([
      expect.objectContaining({ walletId: 1, direction: EntryDirection.DEBIT, amount: 25_000 }),
      expect.objectContaining({ walletId: 2, direction: EntryDirection.CREDIT, amount: 25_000 }),
    ]);
  });

  it('locks wallets in ascending id order to avoid deadlocks', async () => {
    // Sender has the higher id: the recipient must still be locked first.
    setup(wallet(7, 1, 100_000), wallet(3, 2, 0));

    await service.transfer(alice, { recipientEmail: bob.email, amount: 10_000 });

    expect(manager.lockOrder).toEqual([3, 7]);
  });

  it('replays the original transfer when the Idempotency-Key was already used', async () => {
    const previous = Object.assign(new Transaction(), {
      id: 50,
      reference: 'TRX-20261123-AAAAAAAAAA',
      type: TransactionType.TRANSFER,
      amount: 25_000,
      fromWalletId: 1,
      toWalletId: 2,
      description: null,
      createdAt: new Date('2026-11-23T09:00:00Z'),
    });
    setup(wallet(1, 1, 75_000), wallet(2, 2, 25_000), { previous });

    const outcome = await service.transfer(
      alice,
      { recipientEmail: bob.email, amount: 25_000 },
      'order-12345',
    );

    expect(outcome.replayed).toBe(true);
    expect(outcome.transfer.reference).toBe(previous.reference);
    expect(outcome.transfer.senderBalanceAfter).toBe(75_000);
    expect(manager.update).not.toHaveBeenCalled();
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('rejects an Idempotency-Key reused for a different amount', async () => {
    const previous = Object.assign(new Transaction(), { id: 50, amount: 25_000, toWalletId: 2 });
    setup(wallet(1, 1, 75_000), wallet(2, 2, 25_000), { previous });

    await expect(
      service.transfer(alice, { recipientEmail: bob.email, amount: 30_000 }, 'order-12345'),
    ).rejects.toThrow(ConflictException);
  });

  it('rejects a malformed Idempotency-Key', async () => {
    setup(wallet(1, 1, 100_000), wallet(2, 2, 0));

    await expect(
      service.transfer(alice, { recipientEmail: bob.email, amount: 1_000 }, 'bad key!'),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a transfer to yourself', async () => {
    setup(wallet(1, 1, 100_000), wallet(2, 2, 0));

    await expect(
      service.transfer(alice, { recipientEmail: alice.email, amount: 1_000 }),
    ).rejects.toThrow('You cannot transfer money to yourself');
  });

  it('rejects an unknown recipient', async () => {
    setup(wallet(1, 1, 100_000), wallet(2, 2, 0));

    await expect(
      service.transfer(alice, { recipientEmail: 'nobody@paylite.tn', amount: 1_000 }),
    ).rejects.toThrow(NotFoundException);
  });

  it('enforces the daily limit using what was already sent today', async () => {
    setup(wallet(1, 1, 5_000_000), wallet(2, 2, 0), { sentToday: '1990000' });

    await expect(
      service.transfer(alice, { recipientEmail: bob.email, amount: 20_000 }),
    ).rejects.toThrow(UnprocessableEntityException);
    expect(manager.update).not.toHaveBeenCalled();
  });
});
