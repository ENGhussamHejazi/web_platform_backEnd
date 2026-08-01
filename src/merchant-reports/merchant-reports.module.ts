import { Module } from '@nestjs/common';
import { MerchantReportsController } from './merchant-reports.controller';
import { MerchantReportsService } from './merchant-reports.service';
import { InventoryReportsService } from './inventory-reports.service';
import { InventoryModule } from '../inventory/inventory.module';
import { EntitlementsModule } from '../entitlements/entitlements.module';

@Module({
  imports: [InventoryModule, EntitlementsModule],
  controllers: [MerchantReportsController],
  providers: [MerchantReportsService, InventoryReportsService],
})
export class MerchantReportsModule {}
