import { NotFoundException } from '@nestjs/common';
import { AdminService } from './admin.service';

describe('AdminService.updatePlan', () => {
  let prisma: {
    store: { findUnique: jest.Mock; update: jest.Mock };
    plan: { findUnique: jest.Mock };
    subscription: { upsert: jest.Mock };
  };
  let service: AdminService;

  beforeEach(() => {
    prisma = {
      store: { findUnique: jest.fn(), update: jest.fn() },
      plan: { findUnique: jest.fn() },
      subscription: { upsert: jest.fn() },
    };
    service = new AdminService(prisma as never, {} as never);
  });

  it('assigns the new plan (and billing cycle, if given) to the store, resetting the subscription window', async () => {
    prisma.store.findUnique.mockResolvedValue({ id: 'store-1', billingCycle: 'MONTHLY' });
    prisma.plan.findUnique.mockResolvedValue({
      id: 'plan-2',
      key: 'pro',
      name: 'احترافي',
      priceMonthly: 100,
      priceYearly: 1000,
    });
    prisma.subscription.upsert.mockResolvedValue({});
    prisma.store.update.mockResolvedValue({
      id: 'store-1',
      name: 'متجري',
      plan: { id: 'plan-2', name: 'احترافي', key: 'pro' },
      billingCycle: 'YEARLY',
    });

    const result = await service.updatePlan('store-1', {
      planId: 'plan-2',
      billingCycle: 'YEARLY',
    });

    expect(prisma.store.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'store-1' },
        data: expect.objectContaining({
          planId: 'plan-2',
          billingCycle: 'YEARLY',
          subscriptionStartAt: expect.any(Date),
          subscriptionEndAt: expect.any(Date),
        }),
      }),
    );
    expect(result.plan?.key).toBe('pro');
  });

  it('throws NotFoundException when the target plan does not exist', async () => {
    prisma.store.findUnique.mockResolvedValue({ id: 'store-1', billingCycle: 'MONTHLY' });
    prisma.plan.findUnique.mockResolvedValue(null);

    await expect(
      service.updatePlan('store-1', { planId: 'missing-plan' }),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.store.update).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when the store does not exist', async () => {
    prisma.store.findUnique.mockResolvedValue(null);

    await expect(
      service.updatePlan('missing-store', { planId: 'plan-2' }),
    ).rejects.toThrow(NotFoundException);
  });
});
