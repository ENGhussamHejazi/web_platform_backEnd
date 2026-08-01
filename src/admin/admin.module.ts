import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { PlansModule } from '../plans/plans.module';
import { MessagingModule } from '../messaging/messaging.module';

@Module({
  imports: [PlansModule, MessagingModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
