import { ForbiddenException } from '@nestjs/common';
import { MerchantReportsController } from './merchant-reports.controller';
import type { AuthUser } from '../common/decorators/current-user.decorator';

describe('MerchantReportsController — feature gating', () => {
  const user: AuthUser = {
    id: 'u1',
    email: 'm@example.com',
    role: 'MERCHANT' as never,
    storeId: 'store-1',
    storeStatus: 'ACTIVE' as never,
  } as AuthUser;

  function build(hasFeature: boolean) {
    const inventoryReportsService = {
      summary: jest.fn().mockResolvedValue({ ok: true }),
      transactions: jest.fn().mockResolvedValue({ ok: true }),
      productPerformance: jest.fn().mockResolvedValue({ ok: true }),
    };
    const entitlements = { hasFeature: jest.fn().mockResolvedValue(hasFeature) };
    const controller = new MerchantReportsController(
      {} as never,
      inventoryReportsService as never,
      {} as never,
      {} as never,
      entitlements as never,
    );
    return { controller, inventoryReportsService, entitlements };
  }

  it('blocks inventory summary when the plan lacks REPORTS_INVENTORY_ANALYTICS', async () => {
    const { controller, inventoryReportsService, entitlements } = build(false);
    await expect(controller.inventorySummary(user)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(entitlements.hasFeature).toHaveBeenCalledWith(
      'store-1',
      'REPORTS_INVENTORY_ANALYTICS',
    );
    expect(inventoryReportsService.summary).not.toHaveBeenCalled();
  });

  it('allows inventory summary when the plan includes REPORTS_INVENTORY_ANALYTICS', async () => {
    const { controller, inventoryReportsService } = build(true);
    await expect(controller.inventorySummary(user)).resolves.toEqual({ ok: true });
    expect(inventoryReportsService.summary).toHaveBeenCalledWith('store-1');
  });

  it('blocks transactions when the plan lacks REPORTS_TRANSACTIONS', async () => {
    const { controller } = build(false);
    await expect(
      controller.transactions(user, { page: 1, pageSize: 20 } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('never gates product performance — core reporting for every plan', async () => {
    const { controller, inventoryReportsService, entitlements } = build(false);
    await expect(controller.productPerformance(user)).resolves.toEqual({ ok: true });
    expect(inventoryReportsService.productPerformance).toHaveBeenCalledWith('store-1');
    expect(entitlements.hasFeature).not.toHaveBeenCalled();
  });
});
