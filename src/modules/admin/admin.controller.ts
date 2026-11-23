import { Body, Controller, Get, Param, ParseIntPipe, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { Paginated } from '../../common/utils/paginate';
import { AdminTransactionsQueryDto } from '../transactions/dto/transaction-query.dto';
import { AdminTransactionView } from '../transactions/transaction.view';
import { TransactionsService } from '../transactions/transactions.service';
import { AdminWalletQueryDto } from '../wallets/dto/admin-wallet-query.dto';
import { UpdateWalletStatusDto } from '../wallets/dto/update-wallet-status.dto';
import { AdminWalletView } from '../wallets/wallet.view';
import { WalletsService } from '../wallets/wallets.service';
import { AdminService, ReconcileReport } from './admin.service';

@ApiTags('Admin')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly wallets: WalletsService,
    private readonly transactions: TransactionsService,
  ) {}

  /** All transactions in the system, with filters. */
  @Get('transactions')
  listTransactions(
    @Query() query: AdminTransactionsQueryDto,
  ): Promise<Paginated<AdminTransactionView>> {
    return this.transactions.listAll(query);
  }

  /** All wallets with their owner, filterable by status and email. */
  @Get('wallets')
  listWallets(@Query() query: AdminWalletQueryDto): Promise<Paginated<AdminWalletView>> {
    return this.wallets.listAll(query);
  }

  /** Freeze or unfreeze a wallet. A frozen wallet can neither send nor receive money. */
  @Patch('wallets/:id/status')
  updateWalletStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateWalletStatusDto,
  ): Promise<AdminWalletView> {
    return this.wallets.updateStatus(id, dto.status);
  }

  /** Check that every wallet balance equals the sum of its ledger entries. */
  @Get('reconcile')
  reconcile(): Promise<ReconcileReport> {
    return this.admin.reconcile();
  }
}
