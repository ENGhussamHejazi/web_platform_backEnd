import { Prisma } from '../../generated/prisma';
import { EmailQueueService } from './email-queue.service';

function duplicateKeyError() {
  return new Prisma.PrismaClientKnownRequestError('duplicate', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

interface EmailLogUpdate {
  where: { id: string };
  data: {
    status?: string;
    sentAt?: Date;
    failedAt?: Date;
    failureCode?: string;
    retryCount?: number;
  };
}

const updates = (update: jest.Mock): EmailLogUpdate[] =>
  update.mock.calls.map(([args]) => args as EmailLogUpdate);

/** Statuses written to EmailLog, in the order they were written. */
function statusTrail(update: jest.Mock): string[] {
  return updates(update)
    .map((u) => u.data.status)
    .filter((s): s is string => Boolean(s));
}

interface EmailLogCreate {
  data: Record<string, unknown> & { status?: string };
}

const created = (create: jest.Mock): EmailLogCreate =>
  create.mock.calls[0][0] as EmailLogCreate;

describe('EmailQueueService', () => {
  let prisma: { emailLog: { create: jest.Mock; update: jest.Mock } };
  let mail: { send: jest.Mock };
  let service: EmailQueueService;

  beforeEach(() => {
    prisma = {
      emailLog: {
        create: jest.fn().mockResolvedValue({ id: 'log-1' }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    mail = { send: jest.fn().mockResolvedValue(undefined) };
    service = new EmailQueueService(prisma as never, mail as never);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const baseInput = {
    idempotencyKey: 'store-application-received:app-1:1',
    type: 'store-application-received',
    applicationId: 'app-1',
    submissionVersion: 1,
    recipientUserId: 'user-1',
    recipientEmail: 'merchant@test.com',
    subject: 'test',
    html: '<p>test</p>',
    text: 'test',
  };

  const flush = () => new Promise((r) => setImmediate(r));

  describe('enqueue', () => {
    it('creates an EmailLog row and sends the email for a new idempotency key', async () => {
      await service.enqueue(baseInput);
      expect(prisma.emailLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            idempotencyKey: baseInput.idempotencyKey,
          }),
        }),
      );
      // Sending happens on setImmediate — flush the microtask/macrotask queue.
      await flush();
      expect(mail.send).toHaveBeenCalledTimes(1);
    });

    it('does not duplicate an email when the idempotency key already exists', async () => {
      prisma.emailLog.create.mockRejectedValueOnce(duplicateKeyError());
      await service.enqueue(baseInput);
      await flush();
      expect(mail.send).not.toHaveBeenCalled();
    });

    it('rethrows a non-duplicate database error instead of silently dropping it', async () => {
      prisma.emailLog.create.mockRejectedValueOnce(new Error('db offline'));
      await expect(service.enqueue(baseInput)).rejects.toThrow('db offline');
    });

    it('does not block the caller on the actual send', async () => {
      let resolveSend: () => void = () => {};
      mail.send.mockReturnValue(
        new Promise<void>((r) => {
          resolveSend = r;
        }),
      );

      await service.enqueue(baseInput);
      // enqueue() has already returned while the send has not even started.
      expect(mail.send).not.toHaveBeenCalled();
      await flush();
      expect(mail.send).toHaveBeenCalled();
      resolveSend();
    });

    it('starts the row as QUEUED', async () => {
      await service.enqueue(baseInput);
      expect(created(prisma.emailLog.create).data.status).toBe('QUEUED');
    });

    it('persists the scope columns used for auditing', async () => {
      await service.enqueue({
        ...baseInput,
        storeId: 'store-1',
        orderId: 'order-1',
      });
      expect(created(prisma.emailLog.create).data).toEqual(
        expect.objectContaining({
          type: baseInput.type,
          storeId: 'store-1',
          orderId: 'order-1',
          applicationId: 'app-1',
          submissionVersion: 1,
        }),
      );
    });

    it('accepts a guest recipient with no user account behind it', async () => {
      await service.enqueue({
        ...baseInput,
        recipientUserId: undefined,
        recipientEmail: 'guest@test.com',
      });
      await flush();
      expect(
        created(prisma.emailLog.create).data.recipientUserId,
      ).toBeUndefined();
      expect(mail.send).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'guest@test.com' }),
      );
    });

    it('passes subject and both bodies through to the transport unchanged', async () => {
      await service.enqueue(baseInput);
      await flush();
      expect(mail.send).toHaveBeenCalledWith({
        to: baseInput.recipientEmail,
        subject: baseInput.subject,
        html: baseInput.html,
        text: baseInput.text,
      });
    });
  });

  describe('delivery lifecycle', () => {
    it('moves QUEUED → PROCESSING → SENT and stamps sentAt', async () => {
      await service.enqueue(baseInput);
      await flush();

      expect(statusTrail(prisma.emailLog.update)).toEqual([
        'PROCESSING',
        'SENT',
      ]);
      const sent = updates(prisma.emailLog.update).at(-1)!;
      expect(sent.where).toEqual({ id: 'log-1' });
      expect(sent.data.sentAt).toBeInstanceOf(Date);
    });

    it('recovers on a retry and still ends up SENT', async () => {
      jest.useFakeTimers();
      mail.send
        .mockRejectedValueOnce(new Error('transient'))
        .mockResolvedValueOnce(undefined);

      await service.enqueue(baseInput);
      await jest.advanceTimersByTimeAsync(0);
      await jest.advanceTimersByTimeAsync(1000);

      expect(mail.send).toHaveBeenCalledTimes(2);
      expect(statusTrail(prisma.emailLog.update)).toContain('SENT');
      expect(statusTrail(prisma.emailLog.update)).not.toContain('FAILED');
    });

    it('backs off exponentially rather than retrying immediately', async () => {
      jest.useFakeTimers();
      mail.send.mockRejectedValue(new Error('smtp down'));

      await service.enqueue(baseInput);
      await jest.advanceTimersByTimeAsync(0);
      expect(mail.send).toHaveBeenCalledTimes(1);

      // First backoff is 1s: nothing fires at 999ms.
      await jest.advanceTimersByTimeAsync(999);
      expect(mail.send).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(1);
      expect(mail.send).toHaveBeenCalledTimes(2);

      // Second backoff doubles to 2s.
      await jest.advanceTimersByTimeAsync(1999);
      expect(mail.send).toHaveBeenCalledTimes(2);
      await jest.advanceTimersByTimeAsync(1);
      expect(mail.send).toHaveBeenCalledTimes(3);
    });

    it('marks the email FAILED after exhausting retries', async () => {
      jest.useFakeTimers();
      mail.send.mockRejectedValue(new Error('smtp down'));
      await service.enqueue(baseInput);

      // Flush the initial setImmediate + two retry backoffs.
      await jest.advanceTimersByTimeAsync(0);
      await jest.advanceTimersByTimeAsync(1000);
      await jest.advanceTimersByTimeAsync(2000);

      const failedCall = updates(prisma.emailLog.update).find(
        (u) => u.data.status === 'FAILED',
      );
      expect(failedCall).toBeDefined();
    });

    it('stops after exactly 3 attempts', async () => {
      jest.useFakeTimers();
      mail.send.mockRejectedValue(new Error('smtp down'));
      await service.enqueue(baseInput);

      await jest.advanceTimersByTimeAsync(0);
      await jest.advanceTimersByTimeAsync(1000);
      await jest.advanceTimersByTimeAsync(2000);
      await jest.advanceTimersByTimeAsync(60_000);

      expect(mail.send).toHaveBeenCalledTimes(3);
    });

    it('records the failure reason and retry count for diagnosis', async () => {
      jest.useFakeTimers();
      mail.send.mockRejectedValue(new Error('535 auth failed'));
      await service.enqueue(baseInput);

      await jest.advanceTimersByTimeAsync(0);
      await jest.advanceTimersByTimeAsync(1000);
      await jest.advanceTimersByTimeAsync(2000);

      const failed = updates(prisma.emailLog.update).find(
        (u) => u.data.status === 'FAILED',
      )!;
      expect(failed.data.failureCode).toContain('535 auth failed');
      expect(failed.data.retryCount).toBe(3);
      expect(failed.data.failedAt).toBeInstanceOf(Date);
    });

    it('truncates a huge provider error so one bad send cannot bloat the row', async () => {
      jest.useFakeTimers();
      mail.send.mockRejectedValue(new Error('x'.repeat(5000)));
      await service.enqueue(baseInput);

      await jest.advanceTimersByTimeAsync(0);
      await jest.advanceTimersByTimeAsync(1000);
      await jest.advanceTimersByTimeAsync(2000);

      const failed = updates(prisma.emailLog.update).find(
        (u) => u.data.status === 'FAILED',
      )!;
      expect(failed.data.failureCode).toHaveLength(200);
    });

    it('handles a non-Error rejection without crashing', async () => {
      jest.useFakeTimers();
      mail.send.mockRejectedValue('just a string');
      await service.enqueue(baseInput);

      await jest.advanceTimersByTimeAsync(0);
      await jest.advanceTimersByTimeAsync(1000);
      await jest.advanceTimersByTimeAsync(2000);

      const failed = updates(prisma.emailLog.update).find(
        (u) => u.data.status === 'FAILED',
      )!;
      expect(failed.data.failureCode).toBe('unknown_error');
    });
  });
});
