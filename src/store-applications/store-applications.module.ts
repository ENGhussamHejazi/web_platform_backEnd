import { Module } from '@nestjs/common';
import { MerchantApplicationController } from './store-applications.controller';
import { AdminApplicationsController } from './admin-applications.controller';
import { StoreApplicationsService } from './store-applications.service';
import { StorageModule } from '../storage/storage.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [StorageModule, NotificationsModule, MailModule],
  controllers: [MerchantApplicationController, AdminApplicationsController],
  providers: [StoreApplicationsService],
})
export class StoreApplicationsModule {}
