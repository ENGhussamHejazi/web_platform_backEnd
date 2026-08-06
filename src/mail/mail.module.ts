import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service';
import { EmailQueueService } from './email-queue.service';
import { TransactionalMailService } from './transactional-mail.service';
import { EntitlementsModule } from '../entitlements/entitlements.module';

/**
 * Global so any feature module can inject TransactionalMailService without
 * every one of them having to import MailModule — email is cross-cutting
 * infrastructure here, like PrismaModule.
 */
@Global()
@Module({
  imports: [EntitlementsModule],
  providers: [MailService, EmailQueueService, TransactionalMailService],
  exports: [MailService, EmailQueueService, TransactionalMailService],
})
export class MailModule {}
