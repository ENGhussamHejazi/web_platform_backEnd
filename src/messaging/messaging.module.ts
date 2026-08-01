import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MessagingService } from './messaging.service';
import { MessagingGateway } from './messaging.gateway';
import { MerchantMessagesController } from './merchant-messages.controller';

@Module({
  imports: [JwtModule.register({})],
  controllers: [MerchantMessagesController],
  providers: [MessagingService, MessagingGateway],
  exports: [MessagingService, MessagingGateway],
})
export class MessagingModule {}
