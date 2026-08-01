import { ConflictException, NotFoundException } from '@nestjs/common';
import { LocationsService } from './locations.service';

function buildCity(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'city-1',
    governorate: 'RIF_DIMASHQ',
    nameAr: 'جرمانا',
    nameEn: 'Jaramana',
    slug: 'jaramana',
    isActive: true,
    displayOrder: 0,
    postalCode: null,
    notes: null,
    ...overrides,
  };
}

describe('LocationsService', () => {
  let prisma: {
    city: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    shippingZone: { count: jest.Mock };
    order: { count: jest.Mock };
    customerAddress: { count: jest.Mock };
    $transaction: jest.Mock;
  };
  let service: LocationsService;

  beforeEach(() => {
    prisma = {
      city: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      shippingZone: { count: jest.fn().mockResolvedValue(0) },
      order: { count: jest.fn().mockResolvedValue(0) },
      customerAddress: { count: jest.fn().mockResolvedValue(0) },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    service = new LocationsService(prisma as never);
  });

  describe('create', () => {
    it('rejects a duplicate Arabic name within the same governorate', async () => {
      prisma.city.findFirst.mockResolvedValue(buildCity());
      await expect(
        service.create({
          governorate: 'RIF_DIMASHQ',
          nameAr: 'جرمانا',
          isActive: true,
          displayOrder: 0,
        }),
      ).rejects.toThrow(ConflictException);
      expect(prisma.city.create).not.toHaveBeenCalled();
    });

    it('allows the same Arabic name in a different governorate', async () => {
      prisma.city.findFirst.mockResolvedValue(null);
      prisma.city.create.mockResolvedValue(buildCity({ governorate: 'ALEPPO' }));
      await service.create({
        governorate: 'ALEPPO',
        nameAr: 'جرمانا',
        isActive: true,
        displayOrder: 0,
      });
      expect(prisma.city.create).toHaveBeenCalled();
    });

    it('derives a slug from the English name when no slug is given', async () => {
      prisma.city.findFirst.mockResolvedValue(null);
      prisma.city.create.mockResolvedValue(buildCity());
      await service.create({
        governorate: 'RIF_DIMASHQ',
        nameAr: 'جرمانا',
        nameEn: 'Jaramana Town',
        isActive: true,
        displayOrder: 0,
      });
      expect(prisma.city.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ slug: 'jaramana-town' }) }),
      );
    });
  });

  describe('remove', () => {
    it('throws NotFoundException for a missing city', async () => {
      prisma.city.findUnique.mockResolvedValue(null);
      await expect(service.remove('missing')).rejects.toThrow(NotFoundException);
    });

    it('refuses to delete a city referenced by a store shipping rate', async () => {
      prisma.city.findUnique.mockResolvedValue(buildCity());
      prisma.shippingZone.count.mockResolvedValue(2);
      await expect(service.remove('city-1')).rejects.toThrow(ConflictException);
      expect(prisma.city.delete).not.toHaveBeenCalled();
    });

    it('refuses to delete a city referenced by past orders', async () => {
      prisma.city.findUnique.mockResolvedValue(buildCity());
      prisma.order.count.mockResolvedValue(5);
      await expect(service.remove('city-1')).rejects.toThrow(ConflictException);
    });

    it('deletes a city with no references', async () => {
      prisma.city.findUnique.mockResolvedValue(buildCity());
      await service.remove('city-1');
      expect(prisma.city.delete).toHaveBeenCalledWith({ where: { id: 'city-1' } });
    });
  });

  describe('listActiveByGovernorate', () => {
    it('only queries active cities for the given governorate', async () => {
      prisma.city.findMany.mockResolvedValue([buildCity()]);
      await service.listActiveByGovernorate('RIF_DIMASHQ' as never);
      expect(prisma.city.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { governorate: 'RIF_DIMASHQ', isActive: true },
        }),
      );
    });
  });

  describe('bulkCreate', () => {
    it('skips entries that already exist and reports the count', async () => {
      prisma.city.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(buildCity());
      prisma.city.create.mockResolvedValue(buildCity());
      const result = await service.bulkCreate({
        governorate: 'RIF_DIMASHQ',
        cities: [{ nameAr: 'مدينة أ' }, { nameAr: 'جرمانا' }],
      });
      expect(result).toEqual({ created: 1, skipped: 1 });
    });
  });
});
