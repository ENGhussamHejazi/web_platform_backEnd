import { BadRequestException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma';
import { StorefrontService } from './storefront.service';
import { InventoryService } from '../inventory/inventory.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MessagingGateway } from '../messaging/messaging.gateway';
import { mailStub } from '../mail/testing/mail-stub';

function buildProduct(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'product-1',
    name: 'منتج تجريبي',
    price: new Prisma.Decimal(100),
    stock: new Prisma.Decimal(5),
    isActive: true,
    hasVariants: false,
    variants: [],
    ...overrides,
  };
}

describe('StorefrontService', () => {
  let prisma: {
    store: { findUnique: jest.Mock };
    category: { findMany: jest.Mock };
    announcement: { findMany: jest.Mock };
    product: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      updateMany: jest.Mock;
      update: jest.Mock;
      findUniqueOrThrow: jest.Mock;
    };
    orderItem: { groupBy: jest.Mock; create: jest.Mock; createMany: jest.Mock };
    homepageSection: { findMany: jest.Mock };
    shippingZone: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      findFirst: jest.Mock;
    };
    order: { create: jest.Mock; findUniqueOrThrow: jest.Mock };
    warehouse: { findFirst: jest.Mock; create: jest.Mock };
    inventoryItem: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      updateMany: jest.Mock;
    };
    stockMovement: { create: jest.Mock };
    stockReservation: { create: jest.Mock };
    user: { updateMany: jest.Mock };
    loyaltyPointTransaction: { create: jest.Mock };
    $transaction: jest.Mock;
  };
  let service: StorefrontService;
  let mail: ReturnType<typeof mailStub>;

  beforeEach(() => {
    prisma = {
      store: { findUnique: jest.fn() },
      category: { findMany: jest.fn() },
      announcement: { findMany: jest.fn().mockResolvedValue([]) },
      product: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        updateMany: jest.fn(),
        update: jest.fn(),
        findUniqueOrThrow: jest.fn(),
      },
      orderItem: {
        groupBy: jest.fn(),
        create: jest.fn().mockResolvedValue({ id: 'item-1' }),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      homepageSection: { findMany: jest.fn() },
      shippingZone: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
      },
      order: { create: jest.fn(), findUniqueOrThrow: jest.fn() },
      warehouse: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'warehouse-1', storeId: 'store-1' }),
        create: jest.fn(),
      },
      inventoryItem: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
      },
      stockMovement: { create: jest.fn() },
      stockReservation: { create: jest.fn() },
      user: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      loyaltyPointTransaction: { create: jest.fn() },
      $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
    };
    mail = mailStub();
    service = new StorefrontService(
      prisma as never,
      new InventoryService(),
      { create: jest.fn() } as unknown as NotificationsService,
      { emitNewOrder: jest.fn() } as unknown as MessagingGateway,
      mail,
    );
  });

  describe('resolveStore', () => {
    it('returns NOT_FOUND when the store does not exist', async () => {
      prisma.store.findUnique.mockResolvedValue(null);
      await expect(service.resolveStore('missing-slug')).resolves.toEqual({
        state: 'NOT_FOUND',
      });
    });

    it('returns PENDING_APPROVAL without leaking internal status/ids for a pending store', async () => {
      prisma.store.findUnique.mockResolvedValue({
        id: 'store-1',
        name: 'متجري',
        slug: 'my-store',
        status: 'PENDING',
        planId: null,
        openingAt: null,
        maintenanceMessage: null,
        plan: null,
      });
      const result = await service.resolveStore('my-store');
      expect(result).toEqual({ state: 'PENDING_APPROVAL', name: 'متجري' });
    });

    it('returns DISABLED for suspended/rejected stores', async () => {
      prisma.store.findUnique.mockResolvedValue({
        id: 'store-1',
        name: 'متجري',
        slug: 'my-store',
        status: 'SUSPENDED',
        planId: null,
        openingAt: null,
        maintenanceMessage: null,
        plan: null,
      });
      const result = await service.resolveStore('my-store');
      expect(result).toEqual({ state: 'DISABLED', name: 'متجري' });
    });

    it('returns MAINTENANCE with a customer-safe message, never statusNote', async () => {
      prisma.store.findUnique.mockResolvedValue({
        id: 'store-1',
        name: 'متجري',
        slug: 'my-store',
        status: 'MAINTENANCE',
        planId: null,
        openingAt: null,
        maintenanceMessage: 'سنعود قريباً',
        plan: null,
      });
      const result = await service.resolveStore('my-store');
      expect(result).toEqual({
        state: 'MAINTENANCE',
        name: 'متجري',
        message: 'سنعود قريباً',
      });
    });

    it('returns OPENING_SOON when ACTIVE with a future openingAt', async () => {
      const future = new Date(Date.now() + 86_400_000);
      prisma.store.findUnique.mockResolvedValue({
        id: 'store-1',
        name: 'متجري',
        slug: 'my-store',
        status: 'ACTIVE',
        planId: 'plan-1',
        openingAt: future,
        maintenanceMessage: null,
        plan: { isActive: true },
      });
      const result = await service.resolveStore('my-store');
      expect(result).toEqual({
        state: 'OPENING_SOON',
        name: 'متجري',
        openingAt: future,
      });
    });

    it('returns SUBSCRIPTION_UNAVAILABLE when ACTIVE with no plan assigned', async () => {
      prisma.store.findUnique.mockResolvedValue({
        id: 'store-1',
        name: 'متجري',
        slug: 'my-store',
        status: 'ACTIVE',
        planId: null,
        openingAt: null,
        maintenanceMessage: null,
        plan: null,
      });
      const result = await service.resolveStore('my-store');
      expect(result).toEqual({
        state: 'SUBSCRIPTION_UNAVAILABLE',
        name: 'متجري',
      });
    });

    it('returns the store profile with categories/announcements when ACTIVE', async () => {
      prisma.store.findUnique.mockResolvedValue({
        id: 'store-1',
        name: 'متجري',
        slug: 'my-store',
        description: null,
        logoUrl: null,
        galleryImages: [],
        primaryColor: '#0EA5A4',
        status: 'ACTIVE',
        planId: 'plan-1',
        openingAt: null,
        maintenanceMessage: null,
        plan: { isActive: true },
      });
      prisma.category.findMany.mockResolvedValue([
        { id: 'cat-1', name: 'ملابس' },
      ]);

      const result = await service.resolveStore('my-store');
      expect(result.state).toBe('ACTIVE');
      if (result.state !== 'ACTIVE') throw new Error('unreachable');
      expect(result.store).toMatchObject({
        slug: 'my-store',
        categories: [{ id: 'cat-1', name: 'ملابس' }],
        announcements: [],
      });
      expect(result.store).not.toHaveProperty('status');
      expect(result.store).not.toHaveProperty('planId');
      expect(result.store).not.toHaveProperty('id');
    });

    it('falls back to the default MINIMAL theme when the store has no theme row', async () => {
      prisma.store.findUnique.mockResolvedValue({
        id: 'store-1',
        name: 'متجري',
        slug: 'my-store',
        status: 'ACTIVE',
        planId: 'plan-1',
        openingAt: null,
        maintenanceMessage: null,
        plan: { isActive: true },
        theme: null,
      });
      prisma.category.findMany.mockResolvedValue([]);

      const result = await service.resolveStore('my-store');
      if (result.state !== 'ACTIVE') throw new Error('unreachable');
      expect(result.store.theme).toMatchObject({
        templateId: 'MINIMAL',
        templateVersion: 2,
      });
    });

    it('exposes only the published theme config, never the draft', async () => {
      prisma.store.findUnique.mockResolvedValue({
        id: 'store-1',
        name: 'متجري',
        slug: 'my-store',
        status: 'ACTIVE',
        planId: 'plan-1',
        openingAt: null,
        maintenanceMessage: null,
        plan: { isActive: true },
        theme: {
          publishedTemplateId: 'MODERN',
          publishedTemplateVersion: 1,
          publishedConfig: { colors: { primary: '#7C3AED' } },
        },
      });
      prisma.category.findMany.mockResolvedValue([]);

      const result = await service.resolveStore('my-store');
      if (result.state !== 'ACTIVE') throw new Error('unreachable');
      // The public payload's config is normalized (missing fields filled from
      // MODERN's template defaults) — only the overridden field is asserted
      // directly, the rest just needs to match the template defaults shape.
      expect(result.store.theme).toMatchObject({
        templateId: 'MODERN',
        templateVersion: 1,
        config: { colors: { primary: '#7C3AED' } },
      });
      expect(result.store).not.toHaveProperty('draftConfig');
    });
  });

  describe('createGuestOrder', () => {
    const activeStore = { id: 'store-1', slug: 'my-store', status: 'ACTIVE' };
    const baseDto = {
      items: [{ productId: 'product-1', quantity: 2 }],
      guestName: 'أحمد',
      guestPhone: '0911111111',
      guestEmail: undefined,
      shippingAddress: 'دمشق - شارع الثورة',
      governorate: 'DAMASCUS' as const,
      redeemLoyaltyReward: false,
    };

    beforeEach(() => {
      prisma.store.findUnique.mockResolvedValue(activeStore);
    });

    /** Arranges the mocks needed for a checkout that succeeds. */
    function arrangeSuccessfulCheckout() {
      prisma.product.findMany.mockResolvedValue([
        buildProduct({ price: new Prisma.Decimal(100) }),
      ]);
      prisma.inventoryItem.findFirst.mockResolvedValue({
        id: 'inv-1',
        quantity: new Prisma.Decimal(5),
        reserved: new Prisma.Decimal(0),
        available: new Prisma.Decimal(5),
      });
      prisma.inventoryItem.updateMany.mockResolvedValue({ count: 1 });
      prisma.shippingZone.findFirst.mockResolvedValue({
        cost: new Prisma.Decimal(15),
      });
      prisma.order.create.mockResolvedValue({ id: 'order-1' });
      prisma.order.findUniqueOrThrow.mockResolvedValue({
        id: 'order-1',
        status: 'PENDING',
        subtotal: new Prisma.Decimal(200),
        shippingCost: new Prisma.Decimal(15),
        total: new Prisma.Decimal(215),
        loyaltyDiscount: new Prisma.Decimal(0),
        pointsRedeemed: 0,
        governorate: 'DAMASCUS',
        shippingAddress: 'دمشق - شارع الثورة',
        createdAt: new Date(),
        items: [],
      });
    }

    it('emails the buyer and the merchant once the order is committed', async () => {
      arrangeSuccessfulCheckout();
      await service.createGuestOrder('my-store', baseDto);
      expect(mail.sendOrderPlaced).toHaveBeenCalledWith('order-1');
    });

    it('does not email when checkout is rejected before an order exists', async () => {
      prisma.product.findMany.mockResolvedValue([
        buildProduct({ isActive: false }),
      ]);
      await expect(
        service.createGuestOrder('my-store', baseDto),
      ).rejects.toThrow(BadRequestException);
      expect(mail.sendOrderPlaced).not.toHaveBeenCalled();
    });

    it('does not let a mail failure break a placed order', async () => {
      arrangeSuccessfulCheckout();
      mail.sendOrderPlaced.mockRejectedValue(new Error('mail down'));
      await expect(
        service.createGuestOrder('my-store', baseDto),
      ).resolves.toBeDefined();
    });

    it('rejects when a product is inactive or missing', async () => {
      prisma.product.findMany.mockResolvedValue([
        buildProduct({ isActive: false }),
      ]);
      await expect(
        service.createGuestOrder('my-store', baseDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when requested quantity exceeds stock', async () => {
      prisma.product.findMany.mockResolvedValue([
        buildProduct({ stock: new Prisma.Decimal(1) }),
      ]);
      await expect(
        service.createGuestOrder('my-store', baseDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('recomputes price/subtotal from the database, ignoring any client-sent price', async () => {
      prisma.product.findMany.mockResolvedValue([
        buildProduct({ price: new Prisma.Decimal(100) }),
      ]);
      prisma.inventoryItem.findFirst.mockResolvedValue({
        id: 'inv-1',
        quantity: new Prisma.Decimal(5),
        reserved: new Prisma.Decimal(0),
        available: new Prisma.Decimal(5),
      });
      prisma.inventoryItem.updateMany.mockResolvedValue({ count: 1 });
      prisma.shippingZone.findFirst.mockResolvedValue({
        cost: new Prisma.Decimal(15),
      });
      let orderData: Record<string, unknown> = {};
      prisma.order.create.mockImplementation(
        ({ data }: { data: Record<string, unknown> }) => {
          orderData = data;
          return Promise.resolve({ id: 'order-1' });
        },
      );
      prisma.order.findUniqueOrThrow.mockImplementation(() =>
        Promise.resolve({
          id: 'order-1',
          status: 'PENDING',
          subtotal: orderData.subtotal,
          shippingCost: orderData.shippingCost,
          total: orderData.total,
          loyaltyDiscount: orderData.loyaltyDiscount,
          pointsRedeemed: orderData.pointsRedeemed,
          governorate: orderData.governorate,
          shippingAddress: orderData.shippingAddress,
          createdAt: new Date(),
          items: [
            {
              id: 'item-1',
              productName: 'منتج تجريبي',
              quantity: 2,
              price: new Prisma.Decimal(100),
            },
          ],
        }),
      );

      const result = await service.createGuestOrder('my-store', baseDto);

      expect(result.subtotal).toBe(200);
      expect(result.shippingCost).toBe(15);
      expect(result.total).toBe(215);
      expect(prisma.inventoryItem.updateMany).toHaveBeenCalledWith({
        where: { id: 'inv-1', available: { gte: 2 } },
        data: {
          available: { decrement: 2 },
          reserved: { increment: 2 },
        },
      });
      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: 'product-1' },
        data: { stock: { decrement: 2 } },
      });
    });

    it('redeems points atomically and applies the configured percentage to the subtotal', async () => {
      prisma.store.findUnique.mockResolvedValue({
        ...activeStore,
        loyaltyPointsEnabled: true,
        pointsRequiredForDiscount: 20,
        loyaltyDiscountPercentage: 15,
      });
      prisma.product.findMany.mockResolvedValue([
        buildProduct({ price: new Prisma.Decimal(100) }),
      ]);
      prisma.inventoryItem.findFirst.mockResolvedValue({
        id: 'inv-1',
        quantity: new Prisma.Decimal(5),
        reserved: new Prisma.Decimal(0),
        available: new Prisma.Decimal(5),
      });
      prisma.inventoryItem.updateMany.mockResolvedValue({ count: 1 });
      prisma.shippingZone.findFirst.mockResolvedValue({
        cost: new Prisma.Decimal(15),
      });
      let orderData2: Record<string, unknown> = {};
      prisma.order.create.mockImplementation(
        ({ data }: { data: Record<string, unknown> }) => {
          orderData2 = data;
          return Promise.resolve({ id: 'order-1' });
        },
      );
      prisma.order.findUniqueOrThrow.mockImplementation(() =>
        Promise.resolve({
          id: 'order-1',
          status: 'PENDING',
          subtotal: orderData2.subtotal,
          shippingCost: orderData2.shippingCost,
          total: orderData2.total,
          loyaltyDiscount: orderData2.loyaltyDiscount,
          pointsRedeemed: orderData2.pointsRedeemed,
          governorate: orderData2.governorate,
          shippingAddress: orderData2.shippingAddress,
          createdAt: new Date(),
          items: [
            {
              id: 'item-1',
              productName: 'منتج تجريبي',
              quantity: 2,
              price: new Prisma.Decimal(100),
            },
          ],
        }),
      );

      const result = await service.createGuestOrder(
        'my-store',
        { ...baseDto, redeemLoyaltyReward: true },
        { id: 'customer-1', role: 'CUSTOMER', storeId: 'store-1' } as never,
      );

      expect(result.loyaltyDiscount).toBe(30);
      expect(result.total).toBe(185);
      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'customer-1',
          storeId: 'store-1',
          loyaltyPoints: { gte: 20 },
        },
        data: { loyaltyPoints: { decrement: 20 } },
      });
      expect(prisma.loyaltyPointTransaction.create).toHaveBeenCalledWith({
        data: {
          storeId: 'store-1',
          customerId: 'customer-1',
          orderId: 'order-1',
          points: 20,
          type: 'REDEEMED',
        },
      });
    });

    it('rolls back checkout redemption when the customer lacks enough points', async () => {
      prisma.store.findUnique.mockResolvedValue({
        ...activeStore,
        loyaltyPointsEnabled: true,
        pointsRequiredForDiscount: 20,
        loyaltyDiscountPercentage: 15,
      });
      prisma.product.findMany.mockResolvedValue([buildProduct()]);
      prisma.inventoryItem.findFirst.mockResolvedValue({
        id: 'inv-1',
        quantity: new Prisma.Decimal(5),
        reserved: new Prisma.Decimal(0),
        available: new Prisma.Decimal(5),
      });
      prisma.inventoryItem.updateMany.mockResolvedValue({ count: 1 });
      prisma.shippingZone.findFirst.mockResolvedValue(null);
      prisma.order.create.mockResolvedValue({ id: 'order-1' });
      prisma.user.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.createGuestOrder(
          'my-store',
          { ...baseDto, redeemLoyaltyReward: true },
          { id: 'customer-1', role: 'CUSTOMER', storeId: 'store-1' } as never,
        ),
      ).rejects.toThrow('رصيد نقاطك غير كافٍ');
      expect(prisma.loyaltyPointTransaction.create).not.toHaveBeenCalled();
    });

    it('throws when the atomic stock reservation finds insufficient available stock (race)', async () => {
      prisma.product.findMany.mockResolvedValue([
        buildProduct({ stock: new Prisma.Decimal(5) }),
      ]);
      prisma.inventoryItem.findFirst.mockResolvedValue({
        id: 'inv-1',
        quantity: new Prisma.Decimal(5),
        reserved: new Prisma.Decimal(5),
        available: new Prisma.Decimal(0),
      });
      prisma.inventoryItem.updateMany.mockResolvedValue({ count: 0 });
      prisma.shippingZone.findFirst.mockResolvedValue(null);
      prisma.order.create.mockResolvedValue({ id: 'order-1' });

      await expect(
        service.createGuestOrder('my-store', baseDto),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('listProducts', () => {
    const activeStore = { id: 'store-1', slug: 'my-store', status: 'ACTIVE' };

    beforeEach(() => {
      prisma.store.findUnique.mockResolvedValue(activeStore);
    });

    it('filters by isFeatured when sort=featured', async () => {
      prisma.product.findMany.mockResolvedValue([]);
      await service.listProducts('my-store', { sort: 'featured' });
      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isFeatured: true }),
        }),
      );
    });

    it('ranks by the denormalized sales counter when sort=bestseller', async () => {
      prisma.product.findMany.mockResolvedValue([
        buildProduct({ id: 'product-2' }),
        buildProduct({ id: 'product-1' }),
      ]);

      const result = await service.listProducts('my-store', {
        sort: 'bestseller',
      });

      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ totalSold: { gt: 0 } }),
          orderBy: [{ totalSold: 'desc' }, { createdAt: 'desc' }],
        }),
      );
      expect(result.map((p) => p.id)).toEqual(['product-2', 'product-1']);
    });

    it('returns an empty list when no product has sales', async () => {
      prisma.product.findMany.mockResolvedValue([]);
      const result = await service.listProducts('my-store', {
        sort: 'bestseller',
      });
      expect(result).toEqual([]);
      expect(prisma.product.findMany).toHaveBeenCalledTimes(1);
    });

    it('filters out non-discounted products when sort=discounted', async () => {
      prisma.product.findMany.mockResolvedValue([
        buildProduct({
          id: 'product-1',
          price: new Prisma.Decimal(100),
          compareAtPrice: new Prisma.Decimal(150),
        }),
        buildProduct({
          id: 'product-2',
          price: new Prisma.Decimal(100),
          compareAtPrice: null,
        }),
      ]);
      const result = await service.listProducts('my-store', {
        sort: 'discounted',
      });
      expect(result.map((p) => p.id)).toEqual(['product-1']);
    });
  });

  describe('listHomepageSections', () => {
    const activeStore = { id: 'store-1', slug: 'my-store', status: 'ACTIVE' };

    beforeEach(() => {
      prisma.store.findUnique.mockResolvedValue(activeStore);
    });

    it('excludes sections whose endDate has already passed', async () => {
      const past = new Date(Date.now() - 86_400_000);
      const future = new Date(Date.now() + 86_400_000);
      prisma.homepageSection.findMany.mockResolvedValue([
        { id: 'sec-1', endDate: past },
        { id: 'sec-2', endDate: future },
        { id: 'sec-3', endDate: null },
      ]);

      const result = await service.listHomepageSections('my-store');
      expect(result.map((s) => s.id)).toEqual(['sec-2', 'sec-3']);
    });
  });
});
