import { formatMillimes } from '../../common/utils/money';
import { Wallet } from '../wallets/wallet.entity';
import { Transaction, TransactionType } from './transaction.entity';

export interface Party {
  walletId: number;
  fullName: string;
  email: string;
}

/** A transaction seen from one wallet's point of view (user history). */
export interface TransactionView {
  reference: string;
  type: TransactionType;
  direction: 'IN' | 'OUT';
  amount: number;
  amountFormatted: string;
  counterparty: { fullName: string; email: string } | null;
  description: string | null;
  createdAt: Date;
}

/** A transaction with both sides visible (admin listing). */
export interface AdminTransactionView {
  reference: string;
  type: TransactionType;
  amount: number;
  amountFormatted: string;
  from: Party | null;
  to: Party | null;
  idempotencyKey: string | null;
  description: string | null;
  createdAt: Date;
}

function toParty(wallet?: Wallet | null): Party | null {
  if (!wallet?.user) {
    return null;
  }
  return { walletId: wallet.id, fullName: wallet.user.fullName, email: wallet.user.email };
}

export function toTransactionView(transaction: Transaction, walletId: number): TransactionView {
  const incoming = transaction.toWalletId === walletId;
  const other = toParty(incoming ? transaction.fromWallet : transaction.toWallet);
  return {
    reference: transaction.reference,
    type: transaction.type,
    direction: incoming ? 'IN' : 'OUT',
    amount: transaction.amount,
    amountFormatted: formatMillimes(transaction.amount),
    counterparty: other ? { fullName: other.fullName, email: other.email } : null,
    description: transaction.description,
    createdAt: transaction.createdAt,
  };
}

export function toAdminTransactionView(transaction: Transaction): AdminTransactionView {
  return {
    reference: transaction.reference,
    type: transaction.type,
    amount: transaction.amount,
    amountFormatted: formatMillimes(transaction.amount),
    from: toParty(transaction.fromWallet),
    to: toParty(transaction.toWallet),
    idempotencyKey: transaction.idempotencyKey,
    description: transaction.description,
    createdAt: transaction.createdAt,
  };
}
