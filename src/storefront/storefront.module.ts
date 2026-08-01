import { Module } from '@nestjs/common';
import { StorefrontController } from './storefront.controller';
import { ReviewsController } from './reviews.controller';
import { StorefrontService } from './storefront.service';
import { AuthModule } from '../auth/auth.module';
import { InventoryModule } from '../inventory/inventory.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MessagingModule } from '../messaging/messaging.module';
import { CaptchaModule } from '../common/captcha/captcha.module';

@Module({
  imports: [
    AuthModule,
    InventoryModule,
    NotificationsModule,
    MessagingModule,
    CaptchaModule,
  ],
  controllers: [StorefrontController, ReviewsController],
  providers: [StorefrontService],
})
export class StorefrontModule {}
