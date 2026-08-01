import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '../../generated/prisma';
import { CustomerAccountService } from './account.service';
import { InventoryService } from '../inventory/inventory.service';
import type { AuthUser } from '../common/decorators/current-user.decorator';

const STORE = {
  id: 'store-1',
  name: 'متجر تجريبي',
  currency: 'SYP',
  primaryColor: '#000',
  logoUrl: null,
};

function buildUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: 'customer-1',
    email: 'c@example.com',
    role: Role.CUSTOMER,
    storeId: STORE.id,
    storeStatus: 'ACTIVE',
    ...overrides,
  };
}

function buildOrder(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'order-1',
    status: 'PENDING',
    subtotal: new Prisma.Decimal(100),
    shippingCost: new Prisma.Decimal(10),
    total: new Prisma.Decimal(110),
    ...overrides,
  };
}

const CITY = {
  id: 'city-1',
  governorate: 'RIF_DIMASHQ',
  nameAr: 'جرمانا',
  nameEn: 'Jaramana',
  isActive: true,
};

function buildAddress(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'address-1',
    customerId: 'customer-1',
    governorate: 'RIF_DIMASHQ',
    cityId: CITY.id,
    cityNameSnapshot: CITY.nameAr,
    detailedAddress: 'شارع الرئيسي، بناء 3',
    building: null,
    floor: null,
    apartment: null,
    landmark: null,
    phone: '0999999999',
    notes: null,
    isDefault: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    city: CITY,
    ...overrides,
  };
}

describe('CustomerAccountService', () => {
  let prisma: {
    store: { findUnique: jest.Mock };
    user: { findUnique: jest.Mock; update: jest.Mock };
    order: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      groupBy: jest.Mock;
      update: jest.Mock;
    };
    city: { findUnique: jest.Mock };
    customerAddress: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      delete: jest.Mock;
    };
    shippingZone: { findUnique: jest.Mock };
    stockReservation: { findMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let service: CustomerAccountService;

  beforeEach(() => {
    prisma = {
      store: { findUnique: jest.fn().mockResolvedValue(STORE) },
      user: { findUnique: jest.fn(), update: jest.fn() },
      order: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        groupBy: jest.fn(),
        update: jest.fn(),
      },
      city: { findUnique: jest.fn().mockResolvedValue(CITY) },
      customerAddress: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
      },
      shippingZone: { findUnique: jest.fn() },
      stockReservation: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
    };
    service = new CustomerAccountService(
      prisma as never,
      new InventoryService(),
    );
  });

  describe('cancelOrder', () => {
    it('rejects a customer from a different store', async () => {
      const otherStoreUser = buildUser({ storeId: 'other-store' });
      await expect(
        service.cancelOrder('slug', otherStoreUser, 'order-1', {
          reason: 'OTHER',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects a non-customer role', async () => {
      const merchant = buildUser({ role: Role.MERCHANT });
      await expect(
        service.cancelOrder('slug', merchant, 'order-1', { reason: 'OTHER' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('404s when the order does not belong to this customer/store', async () => {
      prisma.order.findFirst.mockResolvedValue(null);
      await expect(
        service.cancelOrder('slug', buildUser(), 'order-1', {
          reason: 'OTHER',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it.each(['PENDING', 'CONFIRMED', 'PROCESSING'])(
      'allows cancellation while status is %s',
      async (status) => {
        prisma.order.findFirst.mockResolvedValue({ id: 'order-1', status });
        prisma.order.update.mockResolvedValue(
          buildOrder({ status: 'CANCELLED', items: [], _count: { items: 0 } }),
        );
        await expect(
          service.cancelOrder('slug', buildUser(), 'order-1', {
            reason: 'OTHER',
          }),
        ).resolves.toBeDefined();
        expect(prisma.order.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              status: 'CANCELLED',
              cancelReason: 'OTHER',
            }),
          }),
        );
      },
    );

    it.each(['SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'])(
      'rejects cancellation once status is %s',
      async (status) => {
        prisma.order.findFirst.mockResolvedValue({ id: 'order-1', status });
        await expect(
          service.cancelOrder('slug', buildUser(), 'order-1', {
            reason: 'OTHER',
          }),
        ).rejects.toThrow(ConflictException);
        expect(prisma.order.update).not.toHaveBeenCalled();
      },
    );
  });

  describe('getOrder', () => {
    it('throws NotFoundException when scoped lookup misses', async () => {
      prisma.order.findFirst.mockResolvedValue(null);
      await expect(
        service.getOrder('slug', buildUser(), 'order-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('marks a PENDING order as cancellable and a DELIVERED order as not', async () => {
      prisma.order.findFirst.mockResolvedValue(
        buildOrder({ status: 'PENDING', items: [], _count: { items: 0 } }),
      );
      const pending = await service.getOrder('slug', buildUser(), 'order-1');
      expect(pending.cancellable).toBe(true);

      prisma.order.findFirst.mockResolvedValue(
        buildOrder({ status: 'DELIVERED', items: [], _count: { items: 0 } }),
      );
      const delivered = await service.getOrder('slug', buildUser(), 'order-1');
      expect(delivered.cancellable).toBe(false);
    });
  });

  describe('createAddress', () => {
    it('rejects when the city does not belong to the given governorate', async () => {
      prisma.city.findUnique.mockResolvedValue({ ...CITY, governorate: 'ALEPPO' });
      await expect(
        service.createAddress('slug', buildUser(), {
          governorate: 'RIF_DIMASHQ',
          cityId: CITY.id,
          detailedAddress: 'شارع الرئيسي',
          phone: '0999999999',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('marks the first address for a customer as default automatically', async () => {
      prisma.customerAddress.count.mockResolvedValue(0);
      prisma.customerAddress.create.mockResolvedValue(buildAddress({ isDefault: true }));
      await service.createAddress('slug', buildUser(), {
        governorate: 'RIF_DIMASHQ',
        cityId: CITY.id,
        detailedAddress: 'شارع الرئيسي',
        phone: '0999999999',
      });
      expect(prisma.customerAddress.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ isDefault: true }) }),
      );
    });

    it('unsets other default addresses when creating a new default one', async () => {
      prisma.customerAddress.count.mockResolvedValue(1);
      prisma.customerAddress.create.mockResolvedValue(buildAddress({ isDefault: true }));
      await service.createAddress('slug', buildUser(), {
        governorate: 'RIF_DIMASHQ',
        cityId: CITY.id,
        detailedAddress: 'شارع الرئيسي',
        phone: '0999999999',
        isDefault: true,
      });
      expect(prisma.customerAddress.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { customerId: 'customer-1' },
          data: { isDefault: false },
        }),
      );
    });
  });

  describe('deleteAddress / updateAddress tenant isolation', () => {
    it('404s when the address belongs to a different customer', async () => {
      prisma.customerAddress.findUnique.mockResolvedValue(
        buildAddress({ customerId: 'someone-else' }),
      );
      await expect(
        service.deleteAddress('slug', buildUser(), 'address-1'),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.updateAddress('slug', buildUser(), 'address-1', {}),
      ).rejects.toThrow(NotFoundException);
    });

    it('promotes the most recent remaining address to default after deleting the default one', async () => {
      prisma.customerAddress.findUnique.mockResolvedValue(buildAddress({ isDefault: true }));
      prisma.customerAddress.findFirst.mockResolvedValue({ id: 'address-2' });
      await service.deleteAddress('slug', buildUser(), 'address-1');
      expect(prisma.customerAddress.update).toHaveBeenCalledWith({
        where: { id: 'address-2' },
        data: { isDefault: true },
      });
    });
  });

  describe('revalidateAddressForStore', () => {
    it('rejects when the saved city is no longer active', async () => {
      prisma.customerAddress.findUnique.mockResolvedValue(
        buildAddress({ city: { ...CITY, isActive: false } }),
      );
      await expect(
        service.revalidateAddressForStore('slug', buildUser(), 'address-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when the store no longer delivers to that city', async () => {
      prisma.customerAddress.findUnique.mockResolvedValue(buildAddress());
      prisma.shippingZone.findUnique.mockResolvedValue(null);
      await expect(
        service.revalidateAddressForStore('slug', buildUser(), 'address-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('returns the current fee when the city is still deliverable', async () => {
      prisma.customerAddress.findUnique.mockResolvedValue(buildAddress());
      prisma.shippingZone.findUnique.mockResolvedValue({
        isDeliveryAvailable: true,
        cost: new Prisma.Decimal(5000),
        currencyCode: 'SYP',
        estimatedDeliveryTime: '1-2 يوم',
        freeDeliveryMinimum: null,
        minimumOrderAmount: null,
      });
      const result = await service.revalidateAddressForStore(
        'slug',
        buildUser(),
        'address-1',
      );
      expect(result.deliveryFee).toBe(5000);
    });
  });
});
