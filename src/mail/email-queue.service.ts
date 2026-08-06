import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from './mail.service';
import { Prisma } from '../../generated/prisma';

export interface EnqueueEmailInput {
  idempotencyKey: string;
  type: string;
  applicationId?: string;
  submissionVersion?: number;
  /** Scope columns — purely for auditing/filtering EmailLog, not for delivery. */
  storeId?: string;
  orderId?: string;
  /** Absent for guest-checkout emails, which have no account behind them. */
  recipientUserId?: string;
  recipientEmail: string;
  subject: string;
  html: string;
  text: string;
}

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;

/**
 * Lightweight in-process email queue. The project has no Redis/Bull
 * infrastructure yet, so this keeps the same contract (queued → processing →
 * sent/failed, retries with backoff, idempotency by key) without adding a new
 * external dependency. Sending never blocks the HTTP request that enqueues it.
 */
@Injectable()
export class EmailQueueService {
  private readonly logger = new Logger(EmailQueueService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  /** Enqueues an email if this idempotency key hasn't been queued before. */
  async enqueue(input: EnqueueEmailInput): Promise<void> {
    let log: { id: string };
    try {
      log = await this.prisma.emailLog.create({
        data: {
          idempotencyKey: input.idempotencyKey,
          type: input.type,
          applicationId: input.applicationId,
          submissionVersion: input.submissionVersion,
          storeId: input.storeId,
          orderId: input.orderId,
          recipientUserId: input.recipientUserId,
          recipientEmail: input.recipientEmail,
          subject: input.subject,
          status: 'QUEUED',
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        // Already queued for this idempotency key — do not duplicate.
        return;
      }
      throw error;
    }

    // Fire-and-forget: never await this from the request path.
    setImmediate(() => {
      this.process(log.id, input, 0).catch((err) =>
        this.logger.error(`Email processing crashed for ${log.id}`, err),
      );
    });
  }

  private async process(
    logId: string,
    input: EnqueueEmailInput,
    attempt: number,
  ): Promise<void> {
    await this.prisma.emailLog.update({
      where: { id: logId },
      data: { status: 'PROCESSING' },
    });

    try {
      await this.mail.send({
        to: input.recipientEmail,
        subject: input.subject,
        html: input.html,
        text: input.text,
      });
      await this.prisma.emailLog.update({
        where: { id: logId },
        data: { status: 'SENT', sentAt: new Date() },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown_error';
      if (attempt + 1 < MAX_RETRIES) {
        await this.prisma.emailLog.update({
          where: { id: logId },
          data: { status: 'QUEUED', retryCount: attempt + 1 },
        });
        const delay = RETRY_BASE_DELAY_MS * 2 ** attempt;
        setTimeout(() => {
          this.process(logId, input, attempt + 1).catch((err) =>
            this.logger.error(`Email retry crashed for ${logId}`, err),
          );
        }, delay);
        return;
      }
      await this.prisma.emailLog.update({
        where: { id: logId },
        data: {
          status: 'FAILED',
          failedAt: new Date(),
          failureCode: message.slice(0, 200),
          retryCount: attempt + 1,
        },
      });
      this.logger.warn(`Email ${logId} failed permanently: ${message}`);
    }
  }
}
