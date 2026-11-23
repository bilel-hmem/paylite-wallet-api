import { ForbiddenException, UnprocessableEntityException } from '@nestjs/common';
import { WalletStatus } from '../wallets/wallet.entity';
import { assertTransferAllowed, TransferCheck } from './transfer-rules';

describe('assertTransferAllowed', () => {
  const valid: TransferCheck = {
    senderStatus: WalletStatus.ACTIVE,
    recipientStatus: WalletStatus.ACTIVE,
    senderBalance: 100_000,
    amount: 25_000,
    sentToday: 0,
    dailyLimit: 2_000_000,
  };

  it('accepts a valid transfer', () => {
    expect(() => assertTransferAllowed(valid)).not.toThrow();
  });

  it('accepts sending the exact balance', () => {
    expect(() => assertTransferAllowed({ ...valid, amount: 100_000 })).not.toThrow();
  });

  it('accepts reaching the daily limit exactly', () => {
    expect(() =>
      assertTransferAllowed({ ...valid, sentToday: 1_975_000, senderBalance: 3_000_000 }),
    ).not.toThrow();
  });

  it.each<[string, Partial<TransferCheck>, new (...args: any[]) => Error, string]>([
    [
      'a frozen sender',
      { senderStatus: WalletStatus.FROZEN },
      ForbiddenException,
      'Your wallet is frozen',
    ],
    [
      'a frozen recipient',
      { recipientStatus: WalletStatus.FROZEN },
      UnprocessableEntityException,
      'Recipient wallet cannot receive funds',
    ],
    [
      'insufficient funds',
      { senderBalance: 24_999 },
      UnprocessableEntityException,
      'Insufficient funds',
    ],
    [
      'going over the daily limit',
      { sentToday: 1_980_000, senderBalance: 3_000_000 },
      UnprocessableEntityException,
      'Daily transfer limit of 2000.000 TND exceeded',
    ],
  ])('rejects %s', (_case, override, errorType, message) => {
    expect(() => assertTransferAllowed({ ...valid, ...override })).toThrow(errorType);
    expect(() => assertTransferAllowed({ ...valid, ...override })).toThrow(message);
  });
});
