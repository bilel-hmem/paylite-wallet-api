import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { trimLower } from '../../../common/utils/transformers';
import { WalletStatus } from '../wallet.entity';

export class AdminWalletQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(WalletStatus)
  status?: WalletStatus;

  /** Part of the owner's email */
  @IsOptional()
  @Transform(trimLower)
  @IsString()
  @MaxLength(180)
  email?: string;
}
