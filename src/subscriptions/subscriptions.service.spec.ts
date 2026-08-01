import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma';
import { SubscriptionsService } from './subscriptions.service';

function buildSubscription(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'sub-1',
    storeId: 'store-1',
    status: 'ACTIVE',
    paymentStatus: 'PAID',
    renewalType: 'MANUAL',
    planId: 'plan-1',
    basePrice: new Prisma.Decimal(50000),
    discount: new Prisma.Decimal(0),
    tax: new Prisma.Decimal(0),
    finalAmount: new Prisma.Decimal(50000),
    currency: 'SYP',
    trialEndsAt: null,
    lastPaymentAt: null,
    nextRenewalAt: null,
    cancelledAt: null,
    cancelReason: null,
    suspendedAt: null,
    suspendReason: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    plan: { id: 'plan-1', name: 'أساسي', key: 'basic', maxProducts: 50, features: [] },
    store: {
      id: 'store-1',
      name: 'متجر تجريبي',
      slug: 'test-store',
      status: 'ACTIVE',
      billingCycle: 'MONTHLY',
      subscriptionStartAt: new Date('2026-01-01T00:00:00Z'),
      subscriptionEndAt: new Date('2099-01-01T00:00:00Z'),
      currency: 'SYP',
      owner: { id: 'owner-1', name: 'تاجر', email: 'm@example.com', phone: null },
      _count: { products: 0, orders: 0 },
    },
    ...overrides,
  };
}

describe('SubscriptionsService', () => {
  let prisma: any;
  let tx: any;
  let service: SubscriptionsService;

  beforeEach(() => {
    tx = {
      store: { update: jest.fn().mockResolvedValue({}) },
      subscription: {
        update: jest.fn().mockResolvedValue(buildSubscription()),
      },
      subscriptionActivity: { create: jest.fn() },
      subscriptionPackageChange: { create: jest.fn() },
      subscriptionPayment: { create: jest.fn() },
      subscriptionNote: { create: jest.fn().mockResolvedValue({ id: 'note-1' }) },
    };
    prisma = {
      subscription: {
        findUnique: jest.fn().mockResolvedValue(buildSubscription()),
      },
      plan: { findUnique: jest.fn() },
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(tx)),
    };
    service = new SubscriptionsService(prisma as never);
  });

  describe('status transition guards', () => {
    it('rejects reactivating a subscription that is not suspended', async () => {
      prisma.subscription.findUnique.mockResolvedValue(
        buildSubscription({ status: 'ACTIVE' }),
      );
      await expect(service.reactivate('sub-1', 'admin-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('allows reactivating a suspended subscription', async () => {
      prisma.subscription.findUnique.mockResolvedValue(
        buildSubscription({ status: 'SUSPENDED' }),
      );
      await service.reactivate('sub-1', 'admin-1');
      expect(tx.subscription.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'ACTIVE' }),
        }),
      );
      expect(tx.subscriptionActivity.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: 'REACTIVATED' }),
        }),
      );
    });

    it('rejects cancelling an already-cancelled subscription', async () => {
      prisma.subscription.findUnique.mockResolvedValue(
        buildSubscription({ status: 'CANCELLED' }),
      );
      await expect(
        service.cancel('sub-1', { reason: 'test' }, 'admin-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects suspending an already-cancelled subscription', async () => {
      prisma.subscription.findUnique.mockResolvedValue(
        buildSubscription({ status: 'CANCELLED' }),
      );
      await expect(
        service.suspend('sub-1', { reason: 'test' }, 'admin-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws NotFoundException for a missing subscription', async () => {
      prisma.subscription.findUnique.mockResolvedValue(null);
      await expect(service.reactivate('missing', 'admin-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('cancel', () => {
    it('writes cancelledAt/cancelReason and an audit activity in one transaction', async () => {
      prisma.subscription.findUnique.mockResolvedValue(
        buildSubscription({ status: 'ACTIVE' }),
      );
      await service.cancel('sub-1', { reason: 'لم يعد بحاجة للخدمة' }, 'admin-1');

      expect(tx.subscription.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'CANCELLED',
            cancelReason: 'لم يعد بحاجة للخدمة',
          }),
        }),
      );
      expect(tx.subscriptionActivity.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'CANCELLED',
            previousValue: 'ACTIVE',
            newValue: 'CANCELLED',
          }),
        }),
      );
    });
  });

  describe('updatePaymentStatus', () => {
    it('records a payment row and both activity entries when marking PAID with an amount', async () => {
      await service.updatePaymentStatus(
        'sub-1',
        { status: 'PAID', amount: 50000, method: 'cash' },
        'admin-1',
      );

      expect(tx.subscriptionPayment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ amount: 50000, status: 'PAID' }),
        }),
      );
      expect(tx.subscriptionActivity.create).toHaveBeenCalledTimes(2);
    });
  });

  describe('addNote', () => {
    it('creates the note and a NOTE_ADDED activity', async () => {
      const result = await service.addNote(
        'sub-1',
        { content: 'ملاحظة داخلية' },
        'admin-1',
      );
      expect(result).toEqual({ id: 'note-1' });
      expect(tx.subscriptionNote.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ content: 'ملاحظة داخلية', authorId: 'admin-1' }),
        }),
      );
      expect(tx.subscriptionActivity.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: 'NOTE_ADDED' }) }),
      );
    });
  });
});
