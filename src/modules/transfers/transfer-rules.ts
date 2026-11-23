import { ForbiddenException, UnprocessableEntityException } from '@nestjs/common';
import { formatMillimes } from '../../common/utils/money';
import { WalletStatus } from '../wallets/wallet.entity';

export interface TransferCheck {
  senderStatus: WalletStatus;
  recipientStatus: WalletStatus;
  senderBalance: number;
  amount: number;
  /** Total already sent today by the sender, in millimes. */
  sentToday: number;
  dailyLimit: number;
}

/**
 * Business rules for a transfer, as a pure function so every rule is unit-tested
 * without a database. Called while both wallets are locked, so the numbers cannot change.
 */
export function assertTransferAllowed(check: TransferCheck): void {
  if (check.senderStatus !== WalletStatus.ACTIVE) {
    throw new ForbiddenException('Your wallet is frozen');
  }
  if (check.recipientStatus !== WalletStatus.ACTIVE) {
    throw new UnprocessableEntityException('Recipient wallet cannot receive funds');
  }
  if (check.amount > check.senderBalance) {
    throw new UnprocessableEntityException('Insufficient funds');
  }
  if (check.sentToday + check.amount > check.dailyLimit) {
    throw new UnprocessableEntityException(
      `Daily transfer limit of ${formatMillimes(check.dailyLimit)} exceeded`,
    );
  }
}
