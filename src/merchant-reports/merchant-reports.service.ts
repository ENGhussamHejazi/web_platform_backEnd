import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OrderStatus, Prisma } from '../../generated/prisma';
import type { MerchantReportsQueryDto } from './dto/merchant-reports.schemas';

const ACTIVE_STATUSES: OrderStatus[] = [
  'PENDING',
  'CONFIRMED',
  'PROCESSING',
  'SHIPPED',
  'OUT_FOR_DELIVERY',
];

const REPORT_ORDER_SELECT = {
  id: true,
  status: true,
  total: true,
  shippingCost: true,
  governorate: true,
  cityId: true,
  cityNameSnapshot: true,
  paymentMethod: true,
  createdAt: true,
  items: {
    select: {
      productId: true,
      productName: true,
      quantity: true,
      price: true,
      product: { select: { category: { select: { name: true } } } },
    },
  },
} satisfies Prisma.OrderSelect;

type ReportOrder = Prisma.OrderGetPayload<{
  select: typeof REPORT_ORDER_SELECT;
}>;

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Number((((current - previous) / previous) * 100).toFixed(1));
}

@Injectable()
export class MerchantReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async reports(storeId: string, query: MerchantReportsQueryDto) {
    const rangeDays = Number(query.range);

    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - (rangeDays - 1));

    const since2x = new Date(since);
    since2x.setDate(since2x.getDate() - rangeDays);

    const orders = await this.prisma.order.findMany({
      where: { storeId, createdAt: { gte: since2x } },
      orderBy: { createdAt: 'asc' },
      select: REPORT_ORDER_SELECT,
    });

    const currentOrders = orders.filter((o) => o.createdAt >= since);
    const previousOrders = orders.filter((o) => o.createdAt < since);

    const revenueOf = (list: ReportOrder[]) =>
      list.reduce(
        (sum, o) => sum + (o.status === 'DELIVERED' ? Number(o.total) : 0),
        0,
      );

    const revenue = revenueOf(currentOrders);
    const prevRevenue = revenueOf(previousOrders);
    const deliveredCount = currentOrders.filter(
      (o) => o.status === 'DELIVERED',
    ).length;
    const pendingCount = currentOrders.filter((o) =>
      ACTIVE_STATUSES.includes(o.status),
    ).length;
    const cancelledCount = currentOrders.filter(
      (o) => o.status === 'CANCELLED',
    ).length;

    const summary = {
      revenue: Number(revenue.toFixed(2)),
      revenueChangePct: pctChange(revenue, prevRevenue),
      orders: currentOrders.length,
      ordersChangePct: pctChange(currentOrders.length, previousOrders.length),
      avgOrderValue:
        deliveredCount > 0 ? Number((revenue / deliveredCount).toFixed(2)) : 0,
      deliveredOrders: deliveredCount,
      pendingOrders: pendingCount,
      cancelledOrders: cancelledCount,
      cancelRate:
        currentOrders.length > 0
          ? Number(((cancelledCount / currentOrders.length) * 100).toFixed(1))
          : 0,
    };

    // Daily gross-sales/order-count trend across the selected range.
    const dayKey = (d: Date) => d.toISOString().slice(0, 10);
    const trendMap = new Map<string, { gross: number; orders: number }>();
    for (let i = 0; i < rangeDays; i++) {
      const d = new Date(since);
      d.setDate(d.getDate() + i);
      trendMap.set(dayKey(d), { gross: 0, orders: 0 });
    }
    for (const order of currentOrders) {
      const key = dayKey(order.createdAt);
      const bucket = trendMap.get(key);
      if (!bucket) continue;
      bucket.orders += 1;
      if (order.status === 'DELIVERED') bucket.gross += Number(order.total);
    }
    const salesTrend = Array.from(trendMap.entries()).map(([date, v]) => ({
      date,
      gross: Number(v.gross.toFixed(2)),
      orders: v.orders,
    }));

    const ordersByStatus = currentOrders.reduce<Record<string, number>>(
      (acc, o) => {
        acc[o.status] = (acc[o.status] ?? 0) + 1;
        return acc;
      },
      {},
    );

    // Top products / category mix / payment mix are computed from realized
    // (delivered) orders only, since that's the revenue that actually landed.
    const deliveredOrders = currentOrders.filter(
      (o) => o.status === 'DELIVERED',
    );

    const productMap = new Map<
      string,
      {
        productId: string | null;
        name: string;
        quantity: number;
        revenue: number;
        orderIds: Set<string>;
        categoryName: string;
      }
    >();
    const categoryMap = new Map<
      string,
      { name: string; revenue: number; quantity: number }
    >();
    for (const order of deliveredOrders) {
      for (const item of order.items) {
        const key = item.productId ?? `deleted:${item.productName}`;
        const quantity = Number(item.quantity);
        const lineRevenue = Number(item.price) * quantity;
        const categoryName = item.product?.category?.name ?? 'بدون تصنيف';
        const p = productMap.get(key) ?? {
          productId: item.productId,
          name: item.productName,
          quantity: 0,
          revenue: 0,
          orderIds: new Set<string>(),
          categoryName,
        };
        p.quantity += quantity;
        p.revenue += lineRevenue;
        p.orderIds.add(order.id);
        productMap.set(key, p);

        const c = categoryMap.get(categoryName) ?? {
          name: categoryName,
          revenue: 0,
          quantity: 0,
        };
        c.revenue += lineRevenue;
        c.quantity += quantity;
        categoryMap.set(categoryName, c);
      }
    }

    // Every distinct product sold in the period, most revenue first — the
    // full list, not just a top-N leaderboard slice.
    const soldProducts = Array.from(productMap.values())
      .map((p) => ({
        productId: p.productId,
        name: p.name,
        category: p.categoryName,
        quantity: p.quantity,
        orders: p.orderIds.size,
        revenue: Number(p.revenue.toFixed(2)),
        avgPrice: Number((p.revenue / p.quantity).toFixed(2)),
      }))
      .sort((a, b) => b.revenue - a.revenue);

    const topProducts = soldProducts.slice(0, 5);

    const salesByCategory = Array.from(categoryMap.values())
      .map((c) => ({ ...c, revenue: Number(c.revenue.toFixed(2)) }))
      .sort((a, b) => b.revenue - a.revenue);

    const governorateMap = new Map<
      string,
      { governorate: string; revenue: number; orders: number }
    >();
    for (const order of currentOrders) {
      const g = governorateMap.get(order.governorate) ?? {
        governorate: order.governorate,
        revenue: 0,
        orders: 0,
      };
      g.orders += 1;
      if (order.status === 'DELIVERED') g.revenue += Number(order.total);
      governorateMap.set(order.governorate, g);
    }
    const salesByGovernorate = Array.from(governorateMap.values())
      .map((g) => ({ ...g, revenue: Number(g.revenue.toFixed(2)) }))
      .sort((a, b) => b.revenue - a.revenue);

    const cityMap = new Map<
      string,
      { cityId: string; cityName: string; revenue: number; orders: number; deliveryRevenue: number }
    >();
    let totalDeliveryRevenue = 0;
    let deliveryOrderCount = 0;
    for (const order of currentOrders) {
      if (order.status !== 'CANCELLED') {
        totalDeliveryRevenue += Number(order.shippingCost);
        if (Number(order.shippingCost) > 0) deliveryOrderCount += 1;
      }
      if (!order.cityId) continue;
      const c = cityMap.get(order.cityId) ?? {
        cityId: order.cityId,
        cityName: order.cityNameSnapshot ?? 'غير معروف',
        revenue: 0,
        orders: 0,
        deliveryRevenue: 0,
      };
      c.orders += 1;
      if (order.status === 'DELIVERED') c.revenue += Number(order.total);
      if (order.status !== 'CANCELLED') c.deliveryRevenue += Number(order.shippingCost);
      cityMap.set(order.cityId, c);
    }
    const salesByCity = Array.from(cityMap.values())
      .map((c) => ({
        ...c,
        revenue: Number(c.revenue.toFixed(2)),
        deliveryRevenue: Number(c.deliveryRevenue.toFixed(2)),
      }))
      .sort((a, b) => b.orders - a.orders);
    const deliveryStats = {
      totalDeliveryRevenue: Number(totalDeliveryRevenue.toFixed(2)),
      avgDeliveryFee:
        deliveryOrderCount > 0
          ? Number((totalDeliveryRevenue / deliveryOrderCount).toFixed(2))
          : 0,
    };

    const paymentMap = new Map<
      string,
      { method: string; revenue: number; orders: number }
    >();
    for (const order of currentOrders) {
      const p = paymentMap.get(order.paymentMethod) ?? {
        method: order.paymentMethod,
        revenue: 0,
        orders: 0,
      };
      p.orders += 1;
      if (order.status === 'DELIVERED') p.revenue += Number(order.total);
      paymentMap.set(order.paymentMethod, p);
    }
    const paymentMethods = Array.from(paymentMap.values())
      .map((p) => ({ ...p, revenue: Number(p.revenue.toFixed(2)) }))
      .sort((a, b) => b.revenue - a.revenue);

    return {
      range: rangeDays,
      summary,
      salesTrend,
      ordersByStatus,
      topProducts,
      soldProducts,
      salesByCategory,
      salesByGovernorate,
      salesByCity,
      deliveryStats,
      paymentMethods,
    };
  }
}
