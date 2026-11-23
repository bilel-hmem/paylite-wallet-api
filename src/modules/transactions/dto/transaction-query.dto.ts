import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsIn, IsInt, IsOptional, Min } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { TransactionType } from '../transaction.entity';

/** Filters shared by the user history and the admin listing. */
export class TransactionFilterDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType;

  /** ISO 8601 date-time, inclusive. @example "2026-11-01T00:00:00Z" */
  @IsOptional()
  @IsDateString()
  from?: string;

  /** ISO 8601 date-time, inclusive. @example "2026-11-30T23:59:59Z" */
  @IsOptional()
  @IsDateString()
  to?: string;

  /** Minimum amount in millimes */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  minAmount?: number;

  /** Maximum amount in millimes */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxAmount?: number;
}

export class MyTransactionsQueryDto extends TransactionFilterDto {
  /** IN = money received, OUT = money sent */
  @IsOptional()
  @IsIn(['IN', 'OUT'])
  direction?: 'IN' | 'OUT';
}

export class AdminTransactionsQueryDto extends TransactionFilterDto {
  /** Only transactions where this wallet is the sender or the receiver */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  walletId?: number;
}
