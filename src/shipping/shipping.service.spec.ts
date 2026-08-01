import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma';
import { ShippingService } from './shipping.service';

function buildCity(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'city-1',
    governorate: 'RIF_DIMASHQ',
    nameAr: 'جرمانا',
    nameEn: 'Jaramana',
    ...overrides,
  };
}

function buildZone(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'zone-1',
    storeId: 'store-1',
    governorate: 'RIF_DIMASHQ',
    cityId: 'city-1',
    cost: new Prisma.Decimal(5000),
    isDeliveryAvailable: true,
    currencyCode: 'SYP',
    estimatedDeliveryTime: '1-2 يوم',
    freeDeliveryMinimum: null,
    minimumOrderAmount: null,
    notes: null,
    ...overrides,
  };
}

describe('ShippingService', () => {
  let prisma: {
    shippingZone: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      upsert: jest.Mock;
      delete: jest.Mock;
    };
    city: { findUnique: jest.Mock; findMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let service: ShippingService;

  beforeEach(() => {
    prisma = {
      shippingZone: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        upsert: jest.fn().mockResolvedValue(buildZone()),
        delete: jest.fn(),
      },
      city: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    service = new ShippingService(prisma as never);
  });

  describe('legacy governorate-wide rates (tenant isolation)', () => {
    it('creates a new legacy zone scoped to the given store when none exists', async () => {
      prisma.shippingZone.findFirst.mockResolvedValue(null);
      prisma.shippingZone.create.mockResolvedValue(buildZone({ cityId: null }));
      await service.set('store-1', 'RIF_DIMASHQ', 5000);
      expect(prisma.shippingZone.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ storeId: 'store-1', cityId: null }),
        }),
      );
    });

    it('updates the existing legacy zone for that store instead of creating a duplicate', async () => {
      prisma.shippingZone.findFirst.mockResolvedValue(buildZone({ id: 'zone-legacy', cityId: null }));
      prisma.shippingZone.update.mockResolvedValue(buildZone({ cityId: null, cost: new Prisma.Decimal(7000) }));
      await service.set('store-1', 'RIF_DIMASHQ', 7000);
      expect(prisma.shippingZone.update).toHaveBeenCalledWith({
        where: { id: 'zone-legacy' },
        data: { cost: new Prisma.Decimal(7000) },
      });
      expect(prisma.shippingZone.create).not.toHaveBeenCalled();
    });

    it('scopes the legacy lookup by storeId, never leaking another store’s zone', async () => {
      await service.list('store-1');
      expect(prisma.shippingZone.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { storeId: 'store-1', cityId: null } }),
      );
    });

    it('404s removing a legacy zone that does not exist for this store', async () => {
      prisma.shippingZone.findFirst.mockResolvedValue(null);
      await expect(service.remove('store-1', 'RIF_DIMASHQ')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('setCityRate', () => {
    it('rejects when the city does not belong to the given governorate', async () => {
      prisma.city.findUnique.mockResolvedValue(buildCity({ governorate: 'ALEPPO' }));
      await expect(
        service.setCityRate('store-1', 'RIF_DIMASHQ' as never, 'city-1', {
          isDeliveryAvailable: true,
          cost: 5000,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.shippingZone.upsert).not.toHaveBeenCalled();
    });

    it('upserts scoped to storeId + governorate + cityId', async () => {
      prisma.city.findUnique.mockResolvedValue(buildCity());
      prisma.shippingZone.upsert.mockResolvedValue(buildZone());
      await service.setCityRate('store-1', 'RIF_DIMASHQ' as never, 'city-1', {
        isDeliveryAvailable: true,
        cost: 5000,
      });
      expect(prisma.shippingZone.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            storeId_governorate_cityId: {
              storeId: 'store-1',
              governorate: 'RIF_DIMASHQ',
              cityId: 'city-1',
            },
          },
        }),
      );
    });
  });

  describe('bulkSetCityRates', () => {
    it('rejects when a requested city id does not exist', async () => {
      prisma.city.findMany.mockResolvedValue([buildCity()]);
      await expect(
        service.bulkSetCityRates('store-1', {
          cityIds: ['city-1', 'city-missing'],
          isDeliveryAvailable: false,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('applies the update to every resolved city via a transaction', async () => {
      prisma.city.findMany.mockResolvedValue([buildCity(), buildCity({ id: 'city-2' })]);
      await service.bulkSetCityRates('store-1', {
        cityIds: ['city-1', 'city-2'],
        isDeliveryAvailable: false,
      });
      expect(prisma.$transaction).toHaveBeenCalledWith(
        expect.arrayContaining([expect.anything(), expect.anything()]),
      );
    });
  });

  describe('copyRates', () => {
    it('404s when the source city has no configured rate for this store', async () => {
      prisma.shippingZone.findFirst.mockResolvedValue(null);
      await expect(
        service.copyRates('store-1', 'city-1', ['city-2']),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects when a target city id is invalid', async () => {
      prisma.shippingZone.findFirst.mockResolvedValue(buildZone());
      prisma.city.findMany.mockResolvedValue([]);
      await expect(
        service.copyRates('store-1', 'city-1', ['city-missing']),
      ).rejects.toThrow(BadRequestException);
    });

    it('copies the source rate values onto every target city', async () => {
      const source = buildZone({ cost: new Prisma.Decimal(9000) });
      prisma.shippingZone.findFirst.mockResolvedValue(source);
      prisma.city.findMany.mockResolvedValue([buildCity({ id: 'city-2' })]);
      await service.copyRates('store-1', 'city-1', ['city-2']);
      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });
});
