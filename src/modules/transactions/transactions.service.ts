import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository, SelectQueryBuilder } from 'typeorm';
import { paginate, Paginated, skipFor } from '../../common/utils/paginate';
import { WalletsService } from '../wallets/wallets.service';
import {
  AdminTransactionsQueryDto,
  MyTransactionsQueryDto,
  TransactionFilterDto,
} from './dto/transaction-query.dto';
import { Transaction } from './transaction.entity';
import {
  AdminTransactionView,
  toAdminTransactionView,
  toTransactionView,
  TransactionView,
} from './transaction.view';

@Injectable()
export class TransactionsService {
  constructor(
    @InjectRepository(Transaction) private readonly transactions: Repository<Transaction>,
    private readonly wallets: WalletsService,
  ) {}

  async listForUser(
    userId: number,
    query: MyTransactionsQueryDto,
  ): Promise<Paginated<TransactionView>> {
    const wallet = await this.wallets.findByUserId(userId);
    const qb = this.baseQuery();
    if (query.direction === 'IN') {
      qb.where('t.toWalletId = :walletId');
    } else if (query.direction === 'OUT') {
      qb.where('t.fromWalletId = :walletId');
    } else {
      qb.where(involvesWallet());
    }
    qb.setParameter('walletId', wallet.id);

    const [rows, total] = await this.page(applyFilters(qb, query), query);
    return paginate(
      rows.map((row) => toTransactionView(row, wallet.id)),
      total,
      query.page,
      query.limit,
    );
  }

  async findOneForUser(userId: number, reference: string): Promise<TransactionView> {
    const wallet = await this.wallets.findByUserId(userId);
    const transaction = await this.baseQuery()
      .where('t.reference = :reference', { reference })
      .andWhere(involvesWallet())
      .setParameter('walletId', wallet.id)
      .getOne();
    // 404 (not 403) for other people's transactions: do not confirm they exist.
    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }
    return toTransactionView(transaction, wallet.id);
  }

  async listAll(query: AdminTransactionsQueryDto): Promise<Paginated<AdminTransactionView>> {
    const qb = this.baseQuery();
    if (query.walletId) {
      qb.where(involvesWallet()).setParameter('walletId', query.walletId);
    }
    const [rows, total] = await this.page(applyFilters(qb, query), query);
    return paginate(rows.map(toAdminTransactionView), total, query.page, query.limit);
  }

  private baseQuery(): SelectQueryBuilder<Transaction> {
    return this.transactions
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.fromWallet', 'fw')
      .leftJoinAndSelect('fw.user', 'fu')
      .leftJoinAndSelect('t.toWallet', 'tw')
      .leftJoinAndSelect('tw.user', 'tu');
  }

  private page(qb: SelectQueryBuilder<Transaction>, query: TransactionFilterDto) {
    return qb
      .orderBy('t.createdAt', query.order)
      .addOrderBy('t.id', query.order)
      .skip(skipFor(query.page, query.limit))
      .take(query.limit)
      .getManyAndCount();
  }
}

function involvesWallet(): Brackets {
  return new Brackets((where) => {
    where.where('t.fromWalletId = :walletId').orWhere('t.toWalletId = :walletId');
  });
}

function applyFilters(
  qb: SelectQueryBuilder<Transaction>,
  filters: TransactionFilterDto,
): SelectQueryBuilder<Transaction> {
  if (filters.type) {
    qb.andWhere('t.type = :type', { type: filters.type });
  }
  if (filters.from) {
    qb.andWhere('t.createdAt >= :from', { from: new Date(filters.from) });
  }
  if (filters.to) {
    qb.andWhere('t.createdAt <= :to', { to: new Date(filters.to) });
  }
  if (filters.minAmount !== undefined) {
    qb.andWhere('t.amount >= :minAmount', { minAmount: filters.minAmount });
  }
  if (filters.maxAmount !== undefined) {
    qb.andWhere('t.amount <= :maxAmount', { maxAmount: filters.maxAmount });
  }
  return qb;
}
