import { Injectable } from '@nestjs/common';
import { Prisma, StoreStatus } from '../../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { STORE_BUSINESS_CATEGORIES } from '../entitlements/business-categories';
import type { ListMarketplaceStoresQueryDto } from './dto/marketplace.schemas';

const STORE_SELECT = {
  id: true,
  name: true,
  slug: true,
  description: true,
  logoUrl: true,
  primaryColor: true,
  currency: true,
  businessCategories: true,
  governorate: true,
  verified: true,
  createdAt: true,
  openingAt: true,
} satisfies Prisma.StoreSelect;

type MarketplaceStoreRow = Prisma.StoreGetPayload<{ select: typeof STORE_SELECT }>;

// Following the same convention as SubscriptionsService (documented there):
// this platform has a modest store count, so DB-filters the cheap columns
// (status/category/governorate/verified/search) then merges rating/price
// aggregates and filters/sorts/paginates in JS, rather than one giant SQL
// query. Deliberate simplification, not an oversight.
@Injectable()
export class MarketplaceService {
  constructor(private readonly prisma: PrismaService) {}

  async listStores(query: ListMarketplaceStoresQueryDto) {
    const where: Prisma.StoreWhereInput = { status: StoreStatus.ACTIVE };
    if (query.categories?.length) {
      where.businessCategories = { hasSome: query.categories };
    }
    if (query.governorate) {
      where.governorate = query.governorate;
    }
    if (query.verifiedOnly) {
      where.verified = true;
    }
    if (query.search) {
      where.name = { contains: query.search, mode: 'insensitive' };
    }

    const stores = await this.prisma.store.findMany({
      where,
      select: STORE_SELECT,
    });
    const storeIds = stores.map((s) => s.id);

    const [ratings, priceRanges, productCounts] = await Promise.all([
      this.prisma.review.groupBy({
        by: ['storeId'],
        where: { storeId: { in: storeIds } },
        _avg: { rating: true },
        _count: { rating: true },
      }),
      this.prisma.product.groupBy({
        by: ['storeId'],
        where: { storeId: { in: storeIds }, isActive: true },
        _min: { price: true },
        _max: { price: true },
      }),
      this.prisma.product.groupBy({
        by: ['storeId'],
        where: { storeId: { in: storeIds }, isActive: true },
        _count: { _all: true },
      }),
    ]);

    const ratingByStore = new Map(
      ratings.map((r) => [r.storeId, { avgRating: r._avg.rating ?? 0, reviewCount: r._count.rating }]),
    );
    const priceByStore = new Map(
      priceRanges.map((p) => [
        p.storeId,
        { minPrice: p._min.price ? Number(p._min.price) : null, maxPrice: p._max.price ? Number(p._max.price) : null },
      ]),
    );
    const productCountByStore = new Map(productCounts.map((p) => [p.storeId, p._count._all]));

    const now = new Date();
    let merged = stores.map((s) => this.mergeStore(s, ratingByStore, priceByStore, productCountByStore, now));

    if (query.minRating !== undefined) {
      merged = merged.filter((s) => s.avgRating >= query.minRating!);
    }
    if (query.openNow) {
      merged = merged.filter((s) => s.openNow);
    }
    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      const min = query.minPrice ?? 0;
      const max = query.maxPrice ?? Infinity;
      merged = merged.filter(
        (s) => s.minPrice !== null && s.maxPrice !== null && s.minPrice <= max && s.maxPrice >= min,
      );
    }

    merged = this.sortStores(merged, query.sort);

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 12;
    const total = merged.length;
    const start = (page - 1) * pageSize;
    const pageItems = merged.slice(start, start + pageSize);

    return {
      stores: pageItems,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  // Category/governorate counts across all ACTIVE stores, ignoring the
  // caller's current filters — powers the filter sidebar's option counts.
  async getFacets() {
    const stores = await this.prisma.store.findMany({
      where: { status: StoreStatus.ACTIVE },
      select: { businessCategories: true, governorate: true },
    });

    const categoryCounts = new Map<string, number>();
    for (const key of STORE_BUSINESS_CATEGORIES) categoryCounts.set(key, 0);
    const governorateCounts = new Map<string, number>();

    for (const s of stores) {
      for (const c of s.businessCategories) {
        categoryCounts.set(c, (categoryCounts.get(c) ?? 0) + 1);
      }
      if (s.governorate) {
        governorateCounts.set(s.governorate, (governorateCounts.get(s.governorate) ?? 0) + 1);
      }
    }

    return {
      total: stores.length,
      categories: Object.fromEntries(categoryCounts),
      governorates: Object.fromEntries(governorateCounts),
    };
  }

  private mergeStore(
    s: MarketplaceStoreRow,
    ratingByStore: Map<string, { avgRating: number; reviewCount: number }>,
    priceByStore: Map<string, { minPrice: number | null; maxPrice: number | null }>,
    productCountByStore: Map<string, number>,
    now: Date,
  ) {
    const rating = ratingByStore.get(s.id) ?? { avgRating: 0, reviewCount: 0 };
    const price = priceByStore.get(s.id) ?? { minPrice: null, maxPrice: null };
    return {
      id: s.id,
      name: s.name,
      slug: s.slug,
      description: s.description,
      logoUrl: s.logoUrl,
      primaryColor: s.primaryColor,
      currency: s.currency,
      businessCategories: s.businessCategories,
      governorate: s.governorate,
      verified: s.verified,
      createdAt: s.createdAt,
      avgRating: Math.round(rating.avgRating * 10) / 10,
      reviewCount: rating.reviewCount,
      minPrice: price.minPrice,
      maxPrice: price.maxPrice,
      productCount: productCountByStore.get(s.id) ?? 0,
      openNow: !s.openingAt || s.openingAt <= now,
    };
  }

  private sortStores<T extends { avgRating: number; reviewCount: number; createdAt: Date; minPrice: number | null; maxPrice: number | null; name: string }>(
    stores: T[],
    sort: ListMarketplaceStoresQueryDto['sort'],
  ): T[] {
    const copy = [...stores];
    switch (sort) {
      case 'NEWEST':
        return copy.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      case 'PRICE_ASC':
        return copy.sort((a, b) => (a.minPrice ?? Infinity) - (b.minPrice ?? Infinity));
      case 'PRICE_DESC':
        return copy.sort((a, b) => (b.maxPrice ?? -Infinity) - (a.maxPrice ?? -Infinity));
      case 'NAME':
        return copy.sort((a, b) => a.name.localeCompare(b.name, 'ar'));
      case 'RATING':
      default:
        return copy.sort(
          (a, b) => b.avgRating - a.avgRating || b.reviewCount - a.reviewCount,
        );
    }
  }
}
