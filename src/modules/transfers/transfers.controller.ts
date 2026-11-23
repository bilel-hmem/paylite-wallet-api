import { Body, Controller, Headers, HttpStatus, Post, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/interfaces/auth-user.interface';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { TransfersService, TransferView } from './transfers.service';

@ApiTags('Transfers')
@ApiBearerAuth()
@Controller('transfers')
export class TransfersController {
  constructor(private readonly transfers: TransfersService) {}

  /**
   * Send money to another user by email.
   *
   * Send an `Idempotency-Key` header to make retries safe: repeating the same request
   * with the same key returns the original transfer (200 + `Idempotent-Replayed: true`)
   * instead of paying twice.
   */
  @Post()
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'Unique key per transfer attempt (8-64 chars: letters, digits, - or _)',
  })
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateTransferDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<TransferView> {
    const outcome = await this.transfers.transfer(user, dto, idempotencyKey);
    if (outcome.replayed) {
      res.status(HttpStatus.OK).setHeader('Idempotent-Replayed', 'true');
    }
    return outcome.transfer;
  }
}
