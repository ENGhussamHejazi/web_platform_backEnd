import { Module } from '@nestjs/common';
import { MailService } from './mail.service';
import { EmailQueueService } from './email-queue.service';

@Module({
  providers: [MailService, EmailQueueService],
  exports: [MailService, EmailQueueService],
})
export class MailModule {}
