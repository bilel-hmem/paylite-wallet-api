import { Module } from '@nestjs/common';
import { TransactionsModule } from '../transactions/transactions.module';
import { WalletsModule } from '../wallets/wallets.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [WalletsModule, TransactionsModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
