import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/interfaces/auth-user.interface';
import { Paginated } from '../../common/utils/paginate';
import { MyTransactionsQueryDto } from './dto/transaction-query.dto';
import { TransactionView } from './transaction.view';
import { TransactionsService } from './transactions.service';

@ApiTags('Transactions')
@ApiBearerAuth()
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactions: TransactionsService) {}

  /** Your history (deposits, money sent and received) with filters and pagination. */
  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query() query: MyTransactionsQueryDto,
  ): Promise<Paginated<TransactionView>> {
    return this.transactions.listForUser(user.id, query);
  }

  /** One of your transactions by its reference, e.g. TRX-20261123-9F2C41AB07. */
  @Get(':reference')
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('reference') reference: string,
  ): Promise<TransactionView> {
    return this.transactions.findOneForUser(user.id, reference);
  }
}
