import { Module } from '@nestjs/common';
import { CustomerChatService } from './customer-chat.service';
import { MerchantCustomerChatController } from './merchant-customer-chat.controller';
import { StorefrontChatController } from './storefront-chat.controller';
import { MessagingModule } from '../messaging/messaging.module';
import { EntitlementsModule } from '../entitlements/entitlements.module';

@Module({
  imports: [MessagingModule, EntitlementsModule],
  controllers: [MerchantCustomerChatController, StorefrontChatController],
  providers: [CustomerChatService],
})
export class CustomerChatModule {}
