import { formatMillimes } from '../../common/utils/money';
import { Wallet, WalletStatus } from './wallet.entity';

export interface WalletView {
  id: number;
  balance: number;
  balanceFormatted: string;
  currency: string;
  status: WalletStatus;
}

export interface AdminWalletView extends WalletView {
  owner: { id: number; fullName: string; email: string } | null;
  createdAt: Date;
}

export function toWalletView(wallet: Wallet): WalletView {
  return {
    id: wallet.id,
    balance: wallet.balance,
    balanceFormatted: formatMillimes(wallet.balance),
    currency: wallet.currency,
    status: wallet.status,
  };
}

export function toAdminWalletView(wallet: Wallet): AdminWalletView {
  return {
    ...toWalletView(wallet),
    owner: wallet.user
      ? { id: wallet.user.id, fullName: wallet.user.fullName, email: wallet.user.email }
      : null,
    createdAt: wallet.createdAt,
  };
}
