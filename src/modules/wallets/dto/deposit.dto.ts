import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { trim } from '../../../common/utils/transformers';

export class DepositDto {
  /**
   * Amount in millimes (1 TND = 1000). Between 1 TND and 10,000 TND.
   * @example 50000
   */
  @IsInt()
  @Min(1_000)
  @Max(10_000_000)
  amount: number;

  /** @example "Top-up from card ****4242" */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(140)
  description?: string;
}
