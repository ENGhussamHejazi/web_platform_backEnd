import { Prisma } from '../../generated/prisma';
import { EmailQueueService } from './email-queue.service';

function duplicateKeyError() {
  return new Prisma.PrismaClientKnownRequestError('duplicate', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

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
    await new Promise((r) => setImmediate(r));
    expect(mail.send).toHaveBeenCalledTimes(1);
  });

  it('does not duplicate an email when the idempotency key already exists', async () => {
    prisma.emailLog.create.mockRejectedValueOnce(duplicateKeyError());
    await service.enqueue(baseInput);
    await new Promise((r) => setImmediate(r));
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('marks the email FAILED after exhausting retries', async () => {
    jest.useFakeTimers();
    mail.send.mockRejectedValue(new Error('smtp down'));
    await service.enqueue(baseInput);

    // Flush the initial setImmediate + two retry backoffs.
    await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(1000);
    await jest.advanceTimersByTimeAsync(2000);

    const failedCall = prisma.emailLog.update.mock.calls.find(
      ([args]) => args.data.status === 'FAILED',
    );
    expect(failedCall).toBeDefined();
    jest.useRealTimers();
  });
});
