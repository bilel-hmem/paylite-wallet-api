import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/interfaces/auth-user.interface';
import { DepositDto } from './dto/deposit.dto';
import { WalletView } from './wallet.view';
import { DepositResult, WalletsService } from './wallets.service';

@ApiTags('Wallets')
@ApiBearerAuth()
@Controller('wallets')
export class WalletsController {
  constructor(private readonly wallets: WalletsService) {}

  /** Current balance (in millimes and formatted) and wallet status. */
  @Get('me')
  getMine(@CurrentUser() user: AuthUser): Promise<WalletView> {
    return this.wallets.getMyWallet(user.id);
  }

  /** Simulated top-up of your own wallet. */
  @Post('me/deposits')
  deposit(@CurrentUser() user: AuthUser, @Body() dto: DepositDto): Promise<DepositResult> {
    return this.wallets.deposit(user.id, dto);
  }
}
