import { Module } from '@nestjs/common';
import { StoreThemeController } from './store-theme.controller';
import { StoreThemeService } from './store-theme.service';
import { EntitlementsModule } from '../entitlements/entitlements.module';

@Module({
  imports: [EntitlementsModule],
  controllers: [StoreThemeController],
  providers: [StoreThemeService],
})
export class StoreThemeModule {}
