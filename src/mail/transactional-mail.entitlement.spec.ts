import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { TransactionalMailService } from './transactional-mail.service';
import { EmailQueueService } from './email-queue.service';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmailEvent } from './email-events';

// Exercises the CUSTOMER_EMAILS plan gate at the dispatch choke point, which
// every one of the 22 email events funnels through.
describe('TransactionalMailService — CUSTOMER_EMAILS gate', () => {
  let service: TransactionalMailService;
  let enqueue: jest.Mock;
  let hasFeature: jest.Mock;

  const dispatch = (event: string, storeId: string | null) =>
    // `dispatch` is private by design — the gate has no other entry point.
    (service as unknown as { dispatch: (i: unknown) => Promise<void> }).dispatch({
      event,
      idempotencySuffix: 'test',
      to: 'buyer@example.com',
      storeId,
      rendered: { subject: 's', html: '<p>h</p>', text: 't' },
    });

  beforeEach(async () => {
    enqueue = jest.fn().mockResolvedValue(undefined);
    hasFeature = jest.fn().mockResolvedValue(false);
    const moduleRef = await Test.createTestingModule({
      providers: [
        TransactionalMailService,
        { provide: PrismaService, useValue: {} },
        { provide: EmailQueueService, useValue: { enqueue } },
        { provide: ConfigService, useValue: { get: () => 'http://localhost:5173' } },
        { provide: EntitlementsService, useValue: { hasFeature } },
      ],
    }).compile();
    service = moduleRef.get(TransactionalMailService);
  });

  it('suppresses a store-branded customer email when the plan lacks the feature', async () => {
    await dispatch(EmailEvent.ORDER_CONFIRMATION, 'store-1');
    expect(hasFeature).toHaveBeenCalledWith('store-1', 'CUSTOMER_EMAILS');
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('sends the same email when the plan grants the feature', async () => {
    hasFeature.mockResolvedValue(true);
    await dispatch(EmailEvent.ORDER_CONFIRMATION, 'store-1');
    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['password reset', EmailEvent.PASSWORD_RESET],
    ['merchant new-order alert', EmailEvent.MERCHANT_NEW_ORDER],
    ['subscription notice', EmailEvent.SUBSCRIPTION_RENEWED],
  ])('never gates the platform email: %s', async (_label, event) => {
    await dispatch(event, 'store-1');
    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it('does not gate platform email that carries no storeId', async () => {
    await dispatch(EmailEvent.MERCHANT_WELCOME, null);
    expect(hasFeature).not.toHaveBeenCalled();
    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it('fails open if the entitlement lookup errors, so orders still confirm', async () => {
    hasFeature.mockRejectedValue(new Error('db down'));
    await dispatch(EmailEvent.ORDER_CONFIRMATION, 'store-1');
    expect(enqueue).toHaveBeenCalledTimes(1);
  });
});
