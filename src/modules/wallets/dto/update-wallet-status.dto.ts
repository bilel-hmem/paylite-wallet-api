import { IsEnum } from 'class-validator';
import { WalletStatus } from '../wallet.entity';

export class UpdateWalletStatusDto {
  /** @example "FROZEN" */
  @IsEnum(WalletStatus)
  status: WalletStatus;
}
