import { Role } from '../../common/enums/role.enum';
import { User } from '../users/user.entity';
import { toWalletView, WalletView } from '../wallets/wallet.view';
import { Wallet } from '../wallets/wallet.entity';

export interface UserProfile {
  id: number;
  fullName: string;
  email: string;
  role: Role;
  createdAt: Date;
  wallet: WalletView | null;
}

export interface LoginResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}

export function toUserProfile(user: User, wallet: Wallet | null): UserProfile {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
    wallet: wallet ? toWalletView(wallet) : null,
  };
}
