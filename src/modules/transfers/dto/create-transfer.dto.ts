import { Transform } from 'class-transformer';
import { IsEmail, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { trim, trimLower } from '../../../common/utils/transformers';

export class CreateTransferDto {
  /** @example "bob@paylite.tn" */
  @Transform(trimLower)
  @IsEmail()
  recipientEmail: string;

  /**
   * Amount in millimes (1 TND = 1000). Between 0.100 TND and 10,000 TND.
   * @example 25000
   */
  @IsInt()
  @Min(100)
  @Max(10_000_000)
  amount: number;

  /** @example "Dinner split" */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(140)
  description?: string;
}
