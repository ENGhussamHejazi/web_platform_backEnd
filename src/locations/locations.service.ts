import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Governorate, Prisma } from '../../generated/prisma';
import type {
  BulkCreateCitiesDto,
  CreateCityDto,
  ListCitiesQueryDto,
  UpdateCityDto,
} from './dto/location.schemas';

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

@Injectable()
export class LocationsService {
  constructor(private readonly prisma: PrismaService) {}

  async listAdmin(query: ListCitiesQueryDto) {
    const where: Prisma.CityWhereInput = {};
    if (query.governorate) where.governorate = query.governorate;
    if (query.status) where.isActive = query.status === 'active';
    if (query.search) {
      where.OR = [
        { nameAr: { contains: query.search, mode: 'insensitive' } },
        { nameEn: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [total, cities] = await Promise.all([
      this.prisma.city.count({ where }),
      this.prisma.city.findMany({
        where,
        orderBy: [{ governorate: 'asc' }, { displayOrder: 'asc' }, { nameAr: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { _count: { select: { shippingZones: true } } },
      }),
    ]);

    return {
      total,
      page: query.page,
      pageSize: query.pageSize,
      items: cities.map(({ _count, ...city }) => ({
        ...city,
        storesUsingCount: _count.shippingZones,
      })),
    };
  }

  private async assertNoDuplicate(
    governorate: Governorate,
    nameAr: string,
    slug: string,
    excludeId?: string,
  ) {
    const duplicate = await this.prisma.city.findFirst({
      where: {
        governorate,
        ...(excludeId ? { id: { not: excludeId } } : {}),
        OR: [{ slug }, { nameAr: { equals: nameAr.trim(), mode: 'insensitive' } }],
      },
    });
    if (duplicate) {
      throw new ConflictException('توجد مدينة بنفس الاسم أو المعرف ضمن هذه المحافظة');
    }
  }

  async create(dto: CreateCityDto) {
    const slug = slugify(dto.slug || dto.nameEn || dto.nameAr);
    await this.assertNoDuplicate(dto.governorate, dto.nameAr, slug);
    return this.prisma.city.create({
      data: {
        governorate: dto.governorate,
        nameAr: dto.nameAr,
        nameEn: dto.nameEn,
        slug,
        isActive: dto.isActive,
        displayOrder: dto.displayOrder,
        postalCode: dto.postalCode,
        notes: dto.notes,
      },
    });
  }

  private async getOrThrow(id: string) {
    const city = await this.prisma.city.findUnique({ where: { id } });
    if (!city) throw new NotFoundException('المدينة غير موجودة');
    return city;
  }

  async update(id: string, dto: UpdateCityDto) {
    const city = await this.getOrThrow(id);
    const governorate = dto.governorate ?? city.governorate;
    const nameAr = dto.nameAr ?? city.nameAr;
    let slug = city.slug;
    if (dto.slug) slug = slugify(dto.slug);
    else if (dto.nameEn && dto.nameEn !== city.nameEn) slug = slugify(dto.nameEn);
    else if (dto.nameAr && !city.nameEn) slug = slugify(dto.nameAr);

    if (governorate !== city.governorate || nameAr !== city.nameAr || slug !== city.slug) {
      await this.assertNoDuplicate(governorate, nameAr, slug, id);
    }

    return this.prisma.city.update({
      where: { id },
      data: {
        governorate: dto.governorate,
        nameAr: dto.nameAr,
        nameEn: dto.nameEn,
        slug,
        isActive: dto.isActive,
        displayOrder: dto.displayOrder,
        postalCode: dto.postalCode,
        notes: dto.notes,
      },
    });
  }

  async remove(id: string) {
    await this.getOrThrow(id);
    const [zoneCount, orderCount, addressCount] = await Promise.all([
      this.prisma.shippingZone.count({ where: { cityId: id } }),
      this.prisma.order.count({ where: { cityId: id } }),
      this.prisma.customerAddress.count({ where: { cityId: id } }),
    ]);
    if (zoneCount > 0 || orderCount > 0 || addressCount > 0) {
      throw new ConflictException(
        'لا يمكن حذف هذه المدينة لأنها مستخدمة حالياً — يمكنك إلغاء تفعيلها بدلاً من ذلك',
      );
    }
    await this.prisma.city.delete({ where: { id } });
    return { id, deleted: true };
  }

  async reorder(governorate: Governorate, cityIds: string[]) {
    const cities = await this.prisma.city.findMany({
      where: { id: { in: cityIds }, governorate },
      select: { id: true },
    });
    if (cities.length !== cityIds.length) {
      throw new NotFoundException('بعض المدن غير موجودة ضمن هذه المحافظة');
    }
    await this.prisma.$transaction(
      cityIds.map((id, index) =>
        this.prisma.city.update({ where: { id }, data: { displayOrder: index } }),
      ),
    );
    return { updated: cityIds.length };
  }

  async bulkCreate(dto: BulkCreateCitiesDto) {
    let created = 0;
    let skipped = 0;
    for (const entry of dto.cities) {
      const slug = slugify(entry.nameEn || entry.nameAr);
      const exists = await this.prisma.city.findFirst({
        where: {
          governorate: dto.governorate,
          OR: [{ slug }, { nameAr: { equals: entry.nameAr.trim(), mode: 'insensitive' } }],
        },
      });
      if (exists) {
        skipped += 1;
        continue;
      }
      await this.prisma.city.create({
        data: {
          governorate: dto.governorate,
          nameAr: entry.nameAr,
          nameEn: entry.nameEn,
          slug,
        },
      });
      created += 1;
    }
    return { created, skipped };
  }

  // -- Public reads --------------------------------------------------

  async listActiveByGovernorate(governorate: Governorate) {
    return this.prisma.city.findMany({
      where: { governorate, isActive: true },
      orderBy: [{ displayOrder: 'asc' }, { nameAr: 'asc' }],
      select: { id: true, nameAr: true, nameEn: true, slug: true },
    });
  }
}
