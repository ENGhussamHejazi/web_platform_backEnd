import { Module } from '@nestjs/common';
import { CustomerAccountController } from './account.controller';
import { CustomerAccountService } from './account.service';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [InventoryModule],
  controllers: [CustomerAccountController],
  providers: [CustomerAccountService],
})
export class CustomerAccountModule {}
