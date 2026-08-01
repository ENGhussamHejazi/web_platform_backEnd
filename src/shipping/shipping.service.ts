import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Governorate, Prisma, ShippingZone } from '../../generated/prisma';
import { GOVERNORATE_VALUES } from './dto/shipping.schemas';
import type { BulkCityRateDto, CityRateDto } from './dto/shipping.schemas';

@Injectable()
export class ShippingService {
  constructor(private readonly prisma: PrismaService) {}

  // -- Legacy governorate-wide rates (cityId = null) --------------------
  // Kept for stores that have not migrated to city-level pricing yet.

  async list(storeId: string) {
    const zones = await this.prisma.shippingZone.findMany({
      where: { storeId, cityId: null },
      select: { id: true, governorate: true, cost: true },
    });
    const byGovernorate = new Map(zones.map((z) => [z.governorate, z]));

    return GOVERNORATE_VALUES.map((governorate) => {
      const zone = byGovernorate.get(governorate);
      return {
        governorate,
        cost: zone ? Number(zone.cost) : null,
        configured: Boolean(zone),
      };
    });
  }

  // Prisma's compound-unique lookup doesn't accept null for a nullable
  // column (and Postgres treats each NULL as distinct anyway), so the
  // cityId=null "governorate-wide" row is looked up/created manually
  // instead of via upsert-by-compound-key.
  private findLegacyZone(storeId: string, governorate: Governorate) {
    return this.prisma.shippingZone.findFirst({
      where: { storeId, governorate, cityId: null },
    });
  }

  async set(storeId: string, governorate: string, cost: number) {
    const existing = await this.findLegacyZone(storeId, governorate as Governorate);
    const zone = existing
      ? await this.prisma.shippingZone.update({
          where: { id: existing.id },
          data: { cost: new Prisma.Decimal(cost) },
        })
      : await this.prisma.shippingZone.create({
          data: {
            storeId,
            governorate: governorate as Governorate,
            cityId: null,
            cost: new Prisma.Decimal(cost),
          },
        });
    return {
      governorate: zone.governorate,
      cost: Number(zone.cost),
      configured: true,
    };
  }

  async remove(storeId: string, governorate: string) {
    const zone = await this.findLegacyZone(storeId, governorate as Governorate);
    if (!zone) throw new NotFoundException('منطقة الشحن غير مُعرّفة');
    await this.prisma.shippingZone.delete({ where: { id: zone.id } });
    return { governorate, cost: null, configured: false };
  }

  // -- Per-city rates ----------------------------------------------------

  private toCityRateDto(
    city: { id: string; nameAr: string; nameEn: string | null },
    zone: ShippingZone | undefined,
  ) {
    return {
      cityId: city.id,
      nameAr: city.nameAr,
      nameEn: city.nameEn,
      isDeliveryAvailable: zone?.isDeliveryAvailable ?? false,
      cost: zone ? Number(zone.cost) : null,
      currencyCode: zone?.currencyCode ?? 'SYP',
      estimatedDeliveryTime: zone?.estimatedDeliveryTime ?? null,
      freeDeliveryMinimum:
        zone?.freeDeliveryMinimum != null ? Number(zone.freeDeliveryMinimum) : null,
      minimumOrderAmount:
        zone?.minimumOrderAmount != null ? Number(zone.minimumOrderAmount) : null,
      notes: zone?.notes ?? null,
      configured: Boolean(zone),
    };
  }

  async listCitiesForGovernorate(
    storeId: string,
    governorate: Governorate,
    search?: string,
  ) {
    const cities = await this.prisma.city.findMany({
      where: {
        governorate,
        isActive: true,
        ...(search
          ? {
              OR: [
                { nameAr: { contains: search, mode: 'insensitive' as const } },
                { nameEn: { contains: search, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      orderBy: [{ displayOrder: 'asc' }, { nameAr: 'asc' }],
      select: { id: true, nameAr: true, nameEn: true },
    });
    const rates = await this.prisma.shippingZone.findMany({
      where: { storeId, governorate, cityId: { in: cities.map((c) => c.id) } },
    });
    const byCity = new Map(rates.map((r) => [r.cityId, r]));
    return cities.map((city) => this.toCityRateDto(city, byCity.get(city.id)));
  }

  private async getCityOrThrow(cityId: string, governorate?: Governorate) {
    const city = await this.prisma.city.findUnique({ where: { id: cityId } });
    if (!city) throw new NotFoundException('المدينة غير موجودة');
    if (governorate && city.governorate !== governorate) {
      throw new BadRequestException('المدينة لا تنتمي لهذه المحافظة');
    }
    return city;
  }

  async setCityRate(
    storeId: string,
    governorate: Governorate,
    cityId: string,
    dto: CityRateDto,
  ) {
    const city = await this.getCityOrThrow(cityId, governorate);
    const zone = await this.prisma.shippingZone.upsert({
      where: { storeId_governorate_cityId: { storeId, governorate, cityId } },
      create: {
        storeId,
        governorate,
        cityId,
        cost: new Prisma.Decimal(dto.cost),
        isDeliveryAvailable: dto.isDeliveryAvailable,
        estimatedDeliveryTime: dto.estimatedDeliveryTime,
        freeDeliveryMinimum:
          dto.freeDeliveryMinimum != null ? new Prisma.Decimal(dto.freeDeliveryMinimum) : null,
        minimumOrderAmount:
          dto.minimumOrderAmount != null ? new Prisma.Decimal(dto.minimumOrderAmount) : null,
        notes: dto.notes,
      },
      update: {
        cost: new Prisma.Decimal(dto.cost),
        isDeliveryAvailable: dto.isDeliveryAvailable,
        estimatedDeliveryTime: dto.estimatedDeliveryTime ?? null,
        freeDeliveryMinimum:
          dto.freeDeliveryMinimum != null ? new Prisma.Decimal(dto.freeDeliveryMinimum) : null,
        minimumOrderAmount:
          dto.minimumOrderAmount != null ? new Prisma.Decimal(dto.minimumOrderAmount) : null,
        notes: dto.notes ?? null,
      },
    });
    return this.toCityRateDto(city, zone);
  }

  async removeCityRate(storeId: string, governorate: Governorate, cityId: string) {
    const zone = await this.prisma.shippingZone.findUnique({
      where: { storeId_governorate_cityId: { storeId, governorate, cityId } },
    });
    if (!zone) throw new NotFoundException('سعر التوصيل غير مُعرّف لهذه المدينة');
    await this.prisma.shippingZone.delete({ where: { id: zone.id } });
    return { cityId, configured: false };
  }

  async bulkSetCityRates(storeId: string, dto: BulkCityRateDto) {
    const cities = await this.prisma.city.findMany({
      where: { id: { in: dto.cityIds } },
    });
    if (cities.length !== dto.cityIds.length) {
      throw new BadRequestException('بعض المدن المحددة غير موجودة');
    }
    await this.prisma.$transaction(
      cities.map((city) =>
        this.prisma.shippingZone.upsert({
          where: {
            storeId_governorate_cityId: {
              storeId,
              governorate: city.governorate,
              cityId: city.id,
            },
          },
          create: {
            storeId,
            governorate: city.governorate,
            cityId: city.id,
            cost: new Prisma.Decimal(dto.cost ?? 0),
            isDeliveryAvailable: dto.isDeliveryAvailable ?? true,
            estimatedDeliveryTime: dto.estimatedDeliveryTime,
            freeDeliveryMinimum:
              dto.freeDeliveryMinimum != null ? new Prisma.Decimal(dto.freeDeliveryMinimum) : null,
            minimumOrderAmount:
              dto.minimumOrderAmount != null ? new Prisma.Decimal(dto.minimumOrderAmount) : null,
            notes: dto.notes,
          },
          update: {
            ...(dto.cost !== undefined ? { cost: new Prisma.Decimal(dto.cost) } : {}),
            ...(dto.isDeliveryAvailable !== undefined
              ? { isDeliveryAvailable: dto.isDeliveryAvailable }
              : {}),
            ...(dto.estimatedDeliveryTime !== undefined
              ? { estimatedDeliveryTime: dto.estimatedDeliveryTime }
              : {}),
            ...(dto.freeDeliveryMinimum !== undefined
              ? {
                  freeDeliveryMinimum:
                    dto.freeDeliveryMinimum != null
                      ? new Prisma.Decimal(dto.freeDeliveryMinimum)
                      : null,
                }
              : {}),
            ...(dto.minimumOrderAmount !== undefined
              ? {
                  minimumOrderAmount:
                    dto.minimumOrderAmount != null
                      ? new Prisma.Decimal(dto.minimumOrderAmount)
                      : null,
                }
              : {}),
            ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
          },
        }),
      ),
    );
    return { updated: cities.length };
  }

  async copyRates(storeId: string, sourceCityId: string, targetCityIds: string[]) {
    const source = await this.prisma.shippingZone.findFirst({
      where: { storeId, cityId: sourceCityId },
    });
    if (!source) {
      throw new NotFoundException('لا يوجد سعر توصيل مُعرّف للمدينة المصدر');
    }
    const targetCities = await this.prisma.city.findMany({
      where: { id: { in: targetCityIds } },
    });
    if (targetCities.length !== targetCityIds.length) {
      throw new BadRequestException('بعض المدن المستهدفة غير موجودة');
    }
    await this.prisma.$transaction(
      targetCities.map((city) =>
        this.prisma.shippingZone.upsert({
          where: {
            storeId_governorate_cityId: {
              storeId,
              governorate: city.governorate,
              cityId: city.id,
            },
          },
          create: {
            storeId,
            governorate: city.governorate,
            cityId: city.id,
            cost: source.cost,
            isDeliveryAvailable: source.isDeliveryAvailable,
            currencyCode: source.currencyCode,
            estimatedDeliveryTime: source.estimatedDeliveryTime,
            freeDeliveryMinimum: source.freeDeliveryMinimum,
            minimumOrderAmount: source.minimumOrderAmount,
            notes: source.notes,
          },
          update: {
            cost: source.cost,
            isDeliveryAvailable: source.isDeliveryAvailable,
            currencyCode: source.currencyCode,
            estimatedDeliveryTime: source.estimatedDeliveryTime,
            freeDeliveryMinimum: source.freeDeliveryMinimum,
            minimumOrderAmount: source.minimumOrderAmount,
            notes: source.notes,
          },
        }),
      ),
    );
    return { updated: targetCities.length };
  }
}
