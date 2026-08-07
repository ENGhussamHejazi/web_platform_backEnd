import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MessagingService } from '../messaging/messaging.service';
import { Prisma, Role, StoreStatus } from '../../generated/prisma';
import { computeSubscriptionEnd } from '../common/subscription.util';
import {
  AdminSearchQueryDto,
  DashboardQueryDto,
  ListAdminCustomersQueryDto,
  ListStoresQueryDto,
  UpdateStorePlanDto,
  UpdateStoreStatusDto,
  UpdateStoreVerifiedDto,
} from './dto/admin.schemas';

// Orders that represent realized revenue.
const REALIZED_STATUSES: Prisma.OrderWhereInput['status'] = {
  in: ['DELIVERED'],
};

// Action-queue ordering: what blocks merchants first, nice-to-know last.
const SEVERITY_RANK = { critical: 0, warning: 1, info: 2 } as const;

const round2 = (n: number) => Number(n.toFixed(2));

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * KPI shape shared by every dashboard tile. `changePercent` is null when the
 * previous window was zero — a jump from 0 has no meaningful percentage, and
 * rendering "+∞%" or a fake "+100%" would misinform the operator.
 */
function delta(value: number, previous: number) {
  return {
    value,
    previous,
    changePercent:
      previous > 0 ? round2(((value - previous) / previous) * 100) : null,
  };
}

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly messaging: MessagingService,
  ) {}

  async listStores(query: ListStoresQueryDto) {
    const where: Prisma.StoreWhereInput = {};
    if (query.status) {
      where.status = query.status;
    }
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { slug: { contains: query.search, mode: 'insensitive' } },
        { owner: { email: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    const stores = await this.prisma.store.findMany({
      where,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        verified: true,
        createdAt: true,
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            lastActiveAt: true,
          },
        },
        plan: {
          select: { id: true, name: true, key: true, priceMonthly: true, priceYearly: true },
        },
        billingCycle: true,
        subscriptionStartAt: true,
        subscriptionEndAt: true,
        _count: { select: { products: true, orders: true } },
      },
    });

    return stores.map((s) => ({
      ...s,
      productCount: s._count.products,
      orderCount: s._count.orders,
      _count: undefined,
    }));
  }

  async getStore(id: string) {
    const store = await this.prisma.store.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        status: true,
        statusNote: true,
        billingCycle: true,
        subscriptionStartAt: true,
        subscriptionEndAt: true,
        plan: {
          select: { id: true, name: true, key: true, priceMonthly: true, priceYearly: true },
        },
        createdAt: true,
        owner: { select: { name: true, email: true, phone: true } },
        _count: { select: { products: true, orders: true } },
      },
    });
    if (!store) {
      throw new NotFoundException('المتجر غير موجود');
    }
    return {
      ...store,
      productCount: store._count.products,
      orderCount: store._count.orders,
      _count: undefined,
    };
  }

  async updateStatus(id: string, dto: UpdateStoreStatusDto) {
    await this.ensureStoreExists(id);
    const store = await this.prisma.store.update({
      where: { id },
      data: {
        status: dto.status,
        statusNote: dto.note ?? null,
      },
      select: { id: true, name: true, status: true, statusNote: true },
    });
    return store;
  }

  async updateVerified(id: string, dto: UpdateStoreVerifiedDto) {
    await this.ensureStoreExists(id);
    return this.prisma.store.update({
      where: { id },
      data: { verified: dto.verified },
      select: { id: true, name: true, verified: true },
    });
  }

  async updatePlan(id: string, dto: UpdateStorePlanDto) {
    const current = await this.prisma.store.findUnique({
      where: { id },
      select: { billingCycle: true },
    });
    if (!current) {
      throw new NotFoundException('المتجر غير موجود');
    }
    const plan = await this.prisma.plan.findUnique({
      where: { id: dto.planId },
    });
    if (!plan) {
      throw new NotFoundException('الباقة غير موجودة');
    }
    const billingCycle = dto.billingCycle ?? current.billingCycle;
    const subscriptionStartAt = new Date();
    const store = await this.prisma.store.update({
      where: { id },
      data: {
        planId: dto.planId,
        billingCycle,
        subscriptionStartAt,
        subscriptionEndAt: computeSubscriptionEnd(
          subscriptionStartAt,
          billingCycle,
        ),
      },
      select: {
        id: true,
        name: true,
        plan: { select: { id: true, name: true, key: true } },
        billingCycle: true,
        subscriptionStartAt: true,
        subscriptionEndAt: true,
      },
    });

    // Keep the Subscription record's pricing in sync with plan changes made
    // through this legacy endpoint (StoresPage.tsx), so the new Subscriptions
    // page reflects plan changes made from either surface. Status/payment
    // status are owned by the subscriptions module, not touched here.
    const basePrice =
      billingCycle === 'YEARLY' ? plan.priceYearly : plan.priceMonthly;
    await this.prisma.subscription.upsert({
      where: { storeId: id },
      create: {
        storeId: id,
        planId: plan.id,
        status: 'ACTIVE',
        paymentStatus: 'UNPAID',
        renewalType: 'MANUAL',
        basePrice,
        finalAmount: basePrice,
        nextRenewalAt: store.subscriptionEndAt,
      },
      update: {
        planId: plan.id,
        basePrice,
        finalAmount: basePrice,
        nextRenewalAt: store.subscriptionEndAt,
      },
    });

    return store;
  }

  async listMessages(id: string) {
    await this.ensureStoreExists(id);
    return this.messaging.listMessages(id, Role.SUPER_ADMIN);
  }

  async sendMessage(id: string, adminUserId: string, body: string) {
    await this.ensureStoreExists(id);
    return this.messaging.sendMessage(id, adminUserId, Role.SUPER_ADMIN, body);
  }

  messageUnreadCounts() {
    return this.messaging.unreadCountsForAdmin();
  }

  messageSummary() {
    return this.messaging.summaryForAdmin();
  }

  async analytics() {
    const [
      storeGroups,
      merchantCount,
      customerCount,
      productCount,
      orderGroups,
      revenueByStore,
    ] = await Promise.all([
      this.prisma.store.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.user.count({ where: { role: Role.MERCHANT } }),
      this.prisma.user.count({ where: { role: Role.CUSTOMER } }),
      this.prisma.product.count(),
      this.prisma.order.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.order.groupBy({
        by: ['storeId'],
        where: { status: REALIZED_STATUSES },
        _sum: { total: true },
      }),
    ]);

    const storesByStatus = this.countByKey(
      storeGroups.map((g) => ({ key: g.status, count: g._count._all })),
    );
    const ordersByStatus = this.countByKey(
      orderGroups.map((g) => ({ key: g.status, count: g._count._all })),
    );

    // Gross realized sales across all stores.
    let grossSales = 0;
    for (const row of revenueByStore) {
      grossSales += Number(row._sum.total ?? 0);
    }

    const totalStores = storeGroups.reduce((n, g) => n + g._count._all, 0);
    const totalOrders = orderGroups.reduce((n, g) => n + g._count._all, 0);

    return {
      totals: {
        stores: totalStores,
        merchants: merchantCount,
        customers: customerCount,
        products: productCount,
        orders: totalOrders,
      },
      storesByStatus,
      ordersByStatus,
      revenue: {
        grossSales: Number(grossSales.toFixed(2)),
      },
      pendingStores: storesByStatus.PENDING ?? 0,
    };
  }

  async reports() {
    const since14 = new Date();
    since14.setDate(since14.getDate() - 13);
    since14.setHours(0, 0, 0, 0);
    const since6mo = new Date();
    since6mo.setMonth(since6mo.getMonth() - 5);
    since6mo.setDate(1);
    since6mo.setHours(0, 0, 0, 0);

    const [recentOrders, recentStores, storesWithRevenue] = await Promise.all([
      this.prisma.order.findMany({
        where: { createdAt: { gte: since14 } },
        select: { createdAt: true, total: true, status: true, storeId: true },
      }),
      this.prisma.store.findMany({
        where: { createdAt: { gte: since6mo } },
        select: { createdAt: true },
      }),
      this.prisma.store.findMany({
        select: {
          id: true,
          name: true,
          orders: {
            where: { status: REALIZED_STATUSES },
            select: { total: true },
          },
        },
      }),
    ]);

    // Daily sales/orders trend, last 14 days.
    const dayKey = (d: Date) => d.toISOString().slice(0, 10);
    const salesTrend: Record<string, { gross: number; orders: number }> = {};
    for (let i = 0; i < 14; i++) {
      const d = new Date(since14);
      d.setDate(d.getDate() + i);
      salesTrend[dayKey(d)] = { gross: 0, orders: 0 };
    }
    for (const order of recentOrders) {
      const key = dayKey(order.createdAt);
      if (!salesTrend[key]) continue;
      salesTrend[key].orders += 1;
      if (order.status === 'DELIVERED') {
        salesTrend[key].gross += Number(order.total);
      }
    }

    // Monthly new-store signups, last 6 months.
    const monthKey = (d: Date) => d.toISOString().slice(0, 7);
    const signupsTrend: Record<string, number> = {};
    for (let i = 0; i < 6; i++) {
      const d = new Date(since6mo);
      d.setMonth(d.getMonth() + i);
      signupsTrend[monthKey(d)] = 0;
    }
    for (const store of recentStores) {
      const key = monthKey(store.createdAt);
      if (key in signupsTrend) signupsTrend[key] += 1;
    }

    // Top 5 stores by realized gross sales.
    const topStores = storesWithRevenue
      .map((s) => ({
        id: s.id,
        name: s.name,
        grossSales: Number(
          s.orders.reduce((sum, o) => sum + Number(o.total), 0).toFixed(2),
        ),
      }))
      .sort((a, b) => b.grossSales - a.grossSales)
      .slice(0, 5);

    return {
      salesTrend: Object.entries(salesTrend).map(([date, v]) => ({
        date,
        gross: Number(v.gross.toFixed(2)),
        orders: v.orders,
      })),
      signupsTrend: Object.entries(signupsTrend).map(([month, count]) => ({
        month,
        count,
      })),
      topStores,
    };
  }

  /**
   * Platform-wide performance report for the SUPER_ADMIN owner view:
   * estimated subscription revenue (MRR), plan distribution, store
   * lifecycle/funnel metrics, platform GMV trend, and merchant health
   * signals. Distinct in scope from `analytics()`/`reports()` (which power
   * the Overview/Reports pages) — this backs a dedicated "أداء المنصة" page.
   */
  async platformReport() {
    const since6mo = new Date();
    since6mo.setMonth(since6mo.getMonth() - 5);
    since6mo.setDate(1);
    since6mo.setHours(0, 0, 0, 0);

    const [
      activeStoresWithPlan,
      allStoresWithPlan,
      storeGroups,
      reviewedApplications,
      recentOrders,
      orderStatusGroups,
      customerOrderGroups,
      dormantStores,
      topStoresRaw,
      totalCustomers,
    ] = await Promise.all([
      this.prisma.store.findMany({
        where: { status: StoreStatus.ACTIVE, planId: { not: null } },
        select: {
          planId: true,
          billingCycle: true,
          plan: {
            select: {
              id: true,
              key: true,
              name: true,
              priceMonthly: true,
              priceYearly: true,
            },
          },
        },
      }),
      this.prisma.store.findMany({
        where: { planId: { not: null } },
        select: {
          plan: { select: { id: true, key: true, name: true } },
        },
      }),
      this.prisma.store.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.storeApplication.findMany({
        where: {
          status: { in: ['APPROVED', 'REJECTED'] },
          submittedAt: { not: null },
        },
        select: {
          submittedAt: true,
          approvedAt: true,
          rejectedAt: true,
          status: true,
        },
      }),
      this.prisma.order.findMany({
        where: { createdAt: { gte: since6mo } },
        select: { createdAt: true, total: true, status: true },
      }),
      this.prisma.order.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.order.groupBy({
        by: ['customerId'],
        where: { customerId: { not: null } },
        _count: { _all: true },
      }),
      this.prisma.store.findMany({
        where: { status: StoreStatus.ACTIVE, orders: { none: {} } },
        select: {
          id: true,
          name: true,
          createdAt: true,
          plan: { select: { name: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.store.findMany({
        select: {
          id: true,
          name: true,
          status: true,
          orders: {
            where: { status: REALIZED_STATUSES },
            select: { total: true },
          },
          _count: { select: { orders: true } },
        },
      }),
      this.prisma.user.count({ where: { role: Role.CUSTOMER } }),
    ]);

    // --- Estimated MRR from ACTIVE stores' assigned plans -------------
    const mrrByPlan = new Map<
      string,
      {
        planKey: string;
        planName: string;
        storeCount: number;
        monthlyEquivalent: number;
      }
    >();
    let mrrTotal = 0;
    let monthlyBillingCount = 0;
    let yearlyBillingCount = 0;
    for (const s of activeStoresWithPlan) {
      if (!s.plan) continue;
      const isYearly = s.billingCycle === 'YEARLY';
      const monthlyEquivalent = isYearly
        ? Number(s.plan.priceYearly) / 12
        : Number(s.plan.priceMonthly);
      if (isYearly) yearlyBillingCount += 1;
      else monthlyBillingCount += 1;
      mrrTotal += monthlyEquivalent;
      const existing = mrrByPlan.get(s.plan.id);
      if (existing) {
        existing.storeCount += 1;
        existing.monthlyEquivalent += monthlyEquivalent;
      } else {
        mrrByPlan.set(s.plan.id, {
          planKey: s.plan.key,
          planName: s.plan.name,
          storeCount: 1,
          monthlyEquivalent,
        });
      }
    }

    // --- Plan distribution across all stores with a plan assigned -----
    const planDistribution = new Map<
      string,
      { planKey: string; planName: string; storeCount: number }
    >();
    for (const s of allStoresWithPlan) {
      if (!s.plan) continue;
      const existing = planDistribution.get(s.plan.id);
      if (existing) existing.storeCount += 1;
      else
        planDistribution.set(s.plan.id, {
          planKey: s.plan.key,
          planName: s.plan.name,
          storeCount: 1,
        });
    }

    // --- Store funnel + application review turnaround -----------------
    const storesByStatus = this.countByKey(
      storeGroups.map((g) => ({ key: g.status, count: g._count._all })),
    );
    let turnaroundSumHours = 0;
    let turnaroundCount = 0;
    for (const app of reviewedApplications) {
      const resolvedAt = app.approvedAt ?? app.rejectedAt;
      if (!app.submittedAt || !resolvedAt) continue;
      const hours =
        (resolvedAt.getTime() - app.submittedAt.getTime()) / 3_600_000;
      if (hours >= 0) {
        turnaroundSumHours += hours;
        turnaroundCount += 1;
      }
    }

    // --- Monthly GMV trend, last 6 months -------------------------------
    const monthKey = (d: Date) => d.toISOString().slice(0, 7);
    const gmvTrend: Record<string, { gross: number; orders: number }> = {};
    for (let i = 0; i < 6; i++) {
      const d = new Date(since6mo);
      d.setMonth(d.getMonth() + i);
      gmvTrend[monthKey(d)] = { gross: 0, orders: 0 };
    }
    for (const order of recentOrders) {
      const key = monthKey(order.createdAt);
      if (!gmvTrend[key]) continue;
      gmvTrend[key].orders += 1;
      if (order.status === 'DELIVERED') {
        gmvTrend[key].gross += Number(order.total);
      }
    }

    const orderStatusBreakdown = this.countByKey(
      orderStatusGroups.map((g) => ({ key: g.status, count: g._count._all })),
    );

    // --- Merchant health: top stores, dormant stores, avg order value --
    const topStores = topStoresRaw
      .map((s) => ({
        id: s.id,
        name: s.name,
        status: s.status,
        grossSales: Number(
          s.orders.reduce((sum, o) => sum + Number(o.total), 0).toFixed(2),
        ),
        orderCount: s._count.orders,
      }))
      .sort((a, b) => b.grossSales - a.grossSales)
      .slice(0, 10);

    const totalDeliveredOrders = orderStatusBreakdown.DELIVERED ?? 0;
    const totalGrossAllTime = topStoresRaw.reduce(
      (sum, s) => sum + s.orders.reduce((a, o) => a + Number(o.total), 0),
      0,
    );
    const avgOrderValue =
      totalDeliveredOrders > 0
        ? Number((totalGrossAllTime / totalDeliveredOrders).toFixed(2))
        : 0;

    // --- Repeat customer rate -------------------------------------------
    const customersWithOrders = customerOrderGroups.length;
    const repeatCustomers = customerOrderGroups.filter(
      (g) => g._count._all >= 2,
    ).length;
    const repeatRate =
      customersWithOrders > 0
        ? Number(((repeatCustomers / customersWithOrders) * 100).toFixed(1))
        : 0;

    return {
      mrr: {
        estimateTotal: Number(mrrTotal.toFixed(2)),
        byPlan: Array.from(mrrByPlan.values()).map((p) => ({
          ...p,
          monthlyEquivalent: Number(p.monthlyEquivalent.toFixed(2)),
        })),
        billingSplit: {
          monthly: monthlyBillingCount,
          yearly: yearlyBillingCount,
        },
      },
      planDistribution: Array.from(planDistribution.values()),
      storeFunnel: {
        byStatus: storesByStatus,
        avgReviewTurnaroundHours:
          turnaroundCount > 0
            ? Number((turnaroundSumHours / turnaroundCount).toFixed(1))
            : null,
        applicationsReviewed: turnaroundCount,
      },
      gmv: {
        monthlyTrend: Object.entries(gmvTrend).map(([month, v]) => ({
          month,
          gross: Number(v.gross.toFixed(2)),
          orders: v.orders,
        })),
        orderStatusBreakdown,
        avgOrderValue,
      },
      merchantHealth: {
        topStores,
        dormantStores: dormantStores.map((s) => ({
          id: s.id,
          name: s.name,
          createdAt: s.createdAt,
          planName: s.plan?.name ?? null,
        })),
      },
      customers: {
        total: totalCustomers,
        customersWithOrders,
        repeatCustomers,
        repeatRate,
      },
    };
  }

  /**
   * Mission-control payload for the super-admin home screen. Everything the
   * operator needs to answer "is the platform healthy and what needs me right
   * now?" in one round-trip: windowed KPIs with period-over-period deltas, a
   * daily series for the sparklines/chart, a prioritized action queue built
   * from real backlog counts, a top-store leaderboard scoped to the window,
   * the plan/MRR mix, and a merged activity feed.
   *
   * Deliberately separate from `analytics()` (all-time totals) and
   * `platformReport()` (deep owner report) — this one is window-scoped and
   * optimized for a single dashboard render.
   */
  async dashboard(query: DashboardQueryDto) {
    const days = query.days;
    const now = new Date();
    const from = startOfDay(addDays(now, -(days - 1)));
    const prevFrom = addDays(from, -days);
    const soon = addDays(now, 7);
    const dormantCutoff = addDays(now, -14);

    const [
      windowOrders,
      windowStores,
      windowCustomers,
      storeGroups,
      applicationGroups,
      subscriptionStatusGroups,
      unpaidSubscriptions,
      renewalsDueSoon,
      activePlanStores,
      storesWithoutPlan,
      dormantStores,
      expiredStoreSubscriptions,
      unreadCounts,
      recentStores,
      recentApplications,
      recentSubscriptionActivity,
      storeNames,
    ] = await Promise.all([
      this.prisma.order.findMany({
        where: { createdAt: { gte: prevFrom } },
        select: {
          createdAt: true,
          total: true,
          status: true,
          storeId: true,
        },
      }),
      this.prisma.store.findMany({
        where: { createdAt: { gte: prevFrom } },
        select: { createdAt: true },
      }),
      this.prisma.user.findMany({
        where: { role: Role.CUSTOMER, createdAt: { gte: prevFrom } },
        select: { createdAt: true },
      }),
      this.prisma.store.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.storeApplication.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      this.prisma.subscription.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      this.prisma.subscription.count({
        where: {
          paymentStatus: { in: ['UNPAID', 'FAILED', 'PENDING_PAYMENT'] },
        },
      }),
      this.prisma.subscription.count({
        where: {
          status: { in: ['ACTIVE', 'TRIAL'] },
          nextRenewalAt: { gte: now, lte: soon },
        },
      }),
      this.prisma.store.findMany({
        where: { status: StoreStatus.ACTIVE, planId: { not: null } },
        select: {
          billingCycle: true,
          plan: {
            select: {
              id: true,
              key: true,
              name: true,
              priceMonthly: true,
              priceYearly: true,
            },
          },
        },
      }),
      this.prisma.store.count({
        where: { status: StoreStatus.ACTIVE, planId: null },
      }),
      this.prisma.store.count({
        where: {
          status: StoreStatus.ACTIVE,
          orders: { none: {} },
          createdAt: { lt: dormantCutoff },
        },
      }),
      this.prisma.store.count({
        where: {
          status: StoreStatus.ACTIVE,
          subscriptionEndAt: { not: null, lt: now },
        },
      }),
      this.messaging.unreadCountsForAdmin(),
      this.prisma.store.findMany({
        orderBy: { createdAt: 'desc' },
        take: 6,
        select: { id: true, name: true, status: true, createdAt: true },
      }),
      this.prisma.storeApplication.findMany({
        where: { submittedAt: { not: null } },
        orderBy: { submittedAt: 'desc' },
        take: 6,
        select: {
          id: true,
          status: true,
          submittedAt: true,
          store: { select: { name: true } },
        },
      }),
      this.prisma.subscriptionActivity.findMany({
        orderBy: { createdAt: 'desc' },
        take: 6,
        select: {
          id: true,
          storeId: true,
          type: true,
          title: true,
          description: true,
          createdAt: true,
          subscription: { select: { store: { select: { name: true } } } },
        },
      }),
      this.prisma.store.findMany({
        select: { id: true, name: true, slug: true },
      }),
    ]);

    // --- Windowed KPIs + previous-window comparison ---------------------
    const inWindow = (d: Date) => d >= from;
    const sumDelivered = (rows: { status: string; total: unknown }[]) =>
      rows.reduce(
        (sum, o) => (o.status === 'DELIVERED' ? sum + Number(o.total) : sum),
        0,
      );

    const currentOrders = windowOrders.filter((o) => inWindow(o.createdAt));
    const previousOrders = windowOrders.filter((o) => !inWindow(o.createdAt));
    const currentGmv = sumDelivered(currentOrders);
    const previousGmv = sumDelivered(previousOrders);
    const currentDelivered = currentOrders.filter(
      (o) => o.status === 'DELIVERED',
    ).length;
    const previousDelivered = previousOrders.filter(
      (o) => o.status === 'DELIVERED',
    ).length;

    const newStores = windowStores.filter((s) => inWindow(s.createdAt)).length;
    const prevNewStores = windowStores.length - newStores;
    const newCustomers = windowCustomers.filter((c) =>
      inWindow(c.createdAt),
    ).length;
    const prevNewCustomers = windowCustomers.length - newCustomers;

    // --- Estimated MRR from ACTIVE stores' assigned plans ---------------
    const planMix = new Map<
      string,
      { planKey: string; planName: string; storeCount: number; mrr: number }
    >();
    let mrr = 0;
    for (const s of activePlanStores) {
      if (!s.plan) continue;
      const monthly =
        s.billingCycle === 'YEARLY'
          ? Number(s.plan.priceYearly) / 12
          : Number(s.plan.priceMonthly);
      mrr += monthly;
      const row = planMix.get(s.plan.id);
      if (row) {
        row.storeCount += 1;
        row.mrr += monthly;
      } else {
        planMix.set(s.plan.id, {
          planKey: s.plan.key,
          planName: s.plan.name,
          storeCount: 1,
          mrr: monthly,
        });
      }
    }

    // --- Daily series across the current window --------------------------
    const dayKey = (d: Date) => d.toISOString().slice(0, 10);
    const series = new Map<
      string,
      {
        date: string;
        gmv: number;
        orders: number;
        stores: number;
        customers: number;
      }
    >();
    for (let i = 0; i < days; i++) {
      const key = dayKey(addDays(from, i));
      series.set(key, {
        date: key,
        gmv: 0,
        orders: 0,
        stores: 0,
        customers: 0,
      });
    }
    for (const order of currentOrders) {
      const row = series.get(dayKey(order.createdAt));
      if (!row) continue;
      row.orders += 1;
      if (order.status === 'DELIVERED') row.gmv += Number(order.total);
    }
    for (const store of windowStores) {
      const row = series.get(dayKey(store.createdAt));
      if (row) row.stores += 1;
    }
    for (const customer of windowCustomers) {
      const row = series.get(dayKey(customer.createdAt));
      if (row) row.customers += 1;
    }

    // --- Leaderboard, scoped to the selected window ----------------------
    const nameById = new Map(storeNames.map((s) => [s.id, s]));
    const perStore = new Map<string, { gmv: number; orders: number }>();
    for (const order of currentOrders) {
      const row = perStore.get(order.storeId) ?? { gmv: 0, orders: 0 };
      row.orders += 1;
      if (order.status === 'DELIVERED') row.gmv += Number(order.total);
      perStore.set(order.storeId, row);
    }
    const topStores = Array.from(perStore.entries())
      .map(([id, v]) => ({
        id,
        name: nameById.get(id)?.name ?? '—',
        slug: nameById.get(id)?.slug ?? null,
        gmv: round2(v.gmv),
        orders: v.orders,
      }))
      .sort((a, b) => b.gmv - a.gmv || b.orders - a.orders)
      .slice(0, 6);

    const storesByStatus = this.countByKey(
      storeGroups.map((g) => ({ key: g.status, count: g._count._all })),
    );
    const applicationsByStatus = this.countByKey(
      applicationGroups.map((g) => ({ key: g.status, count: g._count._all })),
    );
    const subscriptionsByStatus = this.countByKey(
      subscriptionStatusGroups.map((g) => ({
        key: g.status,
        count: g._count._all,
      })),
    );
    const ordersByStatus = this.countByKey(
      currentOrders.map((o) => ({ key: o.status, count: 1 })),
    );
    const unreadMessages = Object.values(unreadCounts).reduce(
      (sum, n) => sum + n,
      0,
    );

    // --- Action queue: only surfaces rows that actually need a human -----
    const queue: {
      key: string;
      severity: 'critical' | 'warning' | 'info';
      label: string;
      count: number;
      href: string;
    }[] = [
      {
        key: 'applications-submitted',
        severity: 'critical',
        label: 'طلبات متاجر بانتظار المراجعة',
        count: applicationsByStatus.SUBMITTED ?? 0,
        href: '/admin/store-applications?status=SUBMITTED',
      },
      {
        key: 'applications-in-review',
        severity: 'warning',
        label: 'طلبات قيد المراجعة',
        count: applicationsByStatus.UNDER_REVIEW ?? 0,
        href: '/admin/store-applications?status=UNDER_REVIEW',
      },
      {
        key: 'stores-pending',
        severity: 'warning',
        label: 'متاجر بانتظار التفعيل',
        count: storesByStatus.PENDING ?? 0,
        href: '/admin/stores?status=PENDING',
      },
      {
        key: 'messages-unread',
        severity: 'critical',
        label: 'رسائل غير مقروءة من التجار',
        count: unreadMessages,
        href: '/admin/messages',
      },
      {
        key: 'subscriptions-unpaid',
        severity: 'critical',
        label: 'اشتراكات غير مدفوعة',
        count: unpaidSubscriptions,
        href: '/admin/subscriptions?paymentStatus=UNPAID',
      },
      {
        key: 'subscriptions-expiring',
        severity: 'warning',
        label: 'اشتراكات تنتهي خلال 7 أيام',
        count: renewalsDueSoon,
        href: '/admin/subscriptions',
      },
      {
        key: 'subscriptions-expired',
        severity: 'critical',
        label: 'متاجر فعّالة باشتراك منتهٍ',
        count: expiredStoreSubscriptions,
        href: '/admin/subscriptions',
      },
      {
        key: 'stores-suspended',
        severity: 'info',
        label: 'متاجر موقوفة',
        count: storesByStatus.SUSPENDED ?? 0,
        href: '/admin/stores?status=SUSPENDED',
      },
      {
        key: 'stores-no-plan',
        severity: 'warning',
        label: 'متاجر فعّالة بدون باقة',
        count: storesWithoutPlan,
        href: '/admin/stores?status=ACTIVE',
      },
      {
        key: 'stores-dormant',
        severity: 'info',
        label: 'متاجر خاملة (بلا أي طلب)',
        count: dormantStores,
        href: '/admin/platform-report',
      },
    ];

    // --- Merged, newest-first activity feed ------------------------------
    const activity = [
      ...recentStores.map((s) => ({
        id: `store-${s.id}`,
        kind: 'store' as const,
        title: `متجر جديد: ${s.name}`,
        detail: `الحالة: ${s.status}`,
        at: s.createdAt,
        href: '/admin/stores',
      })),
      ...recentApplications.map((a) => ({
        id: `application-${a.id}`,
        kind: 'application' as const,
        title: `طلب متجر: ${a.store?.name ?? '—'}`,
        detail: `الحالة: ${a.status}`,
        at: a.submittedAt as Date,
        href: `/admin/store-applications/${a.id}`,
      })),
      ...recentSubscriptionActivity.map((a) => ({
        id: `subscription-${a.id}`,
        kind: 'subscription' as const,
        title: a.title,
        detail: a.subscription?.store?.name ?? a.description ?? '',
        at: a.createdAt,
        href: '/admin/subscriptions',
      })),
    ]
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(0, 12);

    return {
      range: {
        days,
        from: from.toISOString(),
        to: now.toISOString(),
      },
      kpis: {
        gmv: delta(round2(currentGmv), round2(previousGmv)),
        orders: delta(currentOrders.length, previousOrders.length),
        deliveredOrders: delta(currentDelivered, previousDelivered),
        avgOrderValue: delta(
          currentDelivered ? round2(currentGmv / currentDelivered) : 0,
          previousDelivered ? round2(previousGmv / previousDelivered) : 0,
        ),
        newStores: delta(newStores, prevNewStores),
        newCustomers: delta(newCustomers, prevNewCustomers),
        mrr: { value: round2(mrr), previous: null, changePercent: null },
        activeStores: {
          value: storesByStatus.ACTIVE ?? 0,
          previous: null,
          changePercent: null,
        },
      },
      series: Array.from(series.values()).map((r) => ({
        ...r,
        gmv: round2(r.gmv),
      })),
      storesByStatus,
      ordersByStatus,
      applicationsByStatus,
      subscriptionsByStatus,
      actionQueue: queue
        .filter((row) => row.count > 0)
        .sort(
          (a, b) =>
            SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
            b.count - a.count,
        ),
      pendingActionsTotal: queue.reduce((sum, row) => sum + row.count, 0),
      topStores,
      planMix: Array.from(planMix.values())
        .map((p) => ({ ...p, mrr: round2(p.mrr) }))
        .sort((a, b) => b.storeCount - a.storeCount),
      activity: activity.map((a) => ({ ...a, at: a.at.toISOString() })),
    };
  }

  /**
   * Cross-entity lookup powering the admin command palette. Kept intentionally
   * small (a handful of hits per entity) — it is a jump-to navigator, not a
   * reporting surface.
   */
  async search(query: AdminSearchQueryDto) {
    const q = query.q;
    const take = query.limit;
    const contains = { contains: q, mode: 'insensitive' as const };

    const [stores, customers, merchants, applications] = await Promise.all([
      this.prisma.store.findMany({
        where: { OR: [{ name: contains }, { slug: contains }] },
        take,
        orderBy: { createdAt: 'desc' },
        select: { id: true, name: true, slug: true, status: true },
      }),
      this.prisma.user.findMany({
        where: {
          role: Role.CUSTOMER,
          OR: [{ name: contains }, { email: contains }, { phone: contains }],
        },
        take,
        orderBy: { createdAt: 'desc' },
        select: { id: true, name: true, email: true, phone: true },
      }),
      this.prisma.user.findMany({
        where: {
          role: Role.MERCHANT,
          OR: [{ name: contains }, { email: contains }, { phone: contains }],
        },
        take,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          email: true,
          store: { select: { id: true, name: true } },
        },
      }),
      this.prisma.storeApplication.findMany({
        where: { store: { OR: [{ name: contains }, { slug: contains }] } },
        take,
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          status: true,
          store: { select: { name: true } },
        },
      }),
    ]);

    return {
      stores: stores.map((s) => ({
        id: s.id,
        title: s.name,
        subtitle: s.slug,
        status: s.status,
        href: `/admin/stores?search=${encodeURIComponent(s.name)}`,
      })),
      customers: customers.map((c) => ({
        id: c.id,
        title: c.name ?? c.email ?? '—',
        subtitle: c.email ?? c.phone ?? '',
        href: `/admin/customers/${c.id}`,
      })),
      merchants: merchants.map((m) => ({
        id: m.id,
        title: m.name ?? m.email ?? '—',
        subtitle: m.store?.name ?? m.email ?? '',
        href: m.store
          ? `/admin/stores?search=${encodeURIComponent(m.store.name)}`
          : '/admin/stores',
      })),
      applications: applications.map((a) => ({
        id: a.id,
        title: a.store?.name ?? '—',
        subtitle: a.status,
        href: `/admin/store-applications/${a.id}`,
      })),
    };
  }

  async listCustomers(query: ListAdminCustomersQueryDto) {
    const where: Prisma.UserWhereInput = { role: Role.CUSTOMER };
    if (query.storeId) {
      where.storeId = query.storeId;
    }
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const customers = await this.prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        avatarUrl: true,
        createdAt: true,
        customerOfStore: { select: { id: true, name: true, slug: true } },
      },
    });

    return this.withCustomerStats(
      customers.map(({ customerOfStore, ...c }) => ({
        ...c,
        store: customerOfStore,
      })),
    );
  }

  async getCustomer(id: string) {
    const customerRow = await this.prisma.user.findFirst({
      where: { id, role: Role.CUSTOMER },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        avatarUrl: true,
        gender: true,
        dateOfBirth: true,
        preferredLanguage: true,
        createdAt: true,
        customerOfStore: { select: { id: true, name: true, slug: true } },
      },
    });
    if (!customerRow) {
      throw new NotFoundException('العميل غير موجود');
    }
    const { customerOfStore, ...rest } = customerRow;
    const customer = { ...rest, store: customerOfStore };

    const [withStats, orders] = await Promise.all([
      this.withCustomerStats([customer]).then((r) => r[0]),
      this.prisma.order.findMany({
        where: { customerId: id },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          status: true,
          total: true,
          createdAt: true,
          governorate: true,
          cityNameSnapshot: true,
          _count: { select: { items: true } },
        },
      }),
    ]);

    return {
      ...withStats,
      orders: orders.map(({ _count, ...o }) => ({
        ...o,
        itemCount: _count.items,
      })),
    };
  }

  private async withCustomerStats<T extends { id: string }>(customers: T[]) {
    if (customers.length === 0) return [];
    const ids = customers.map((c) => c.id);
    const [orderStats, revenueStats] = await Promise.all([
      this.prisma.order.groupBy({
        by: ['customerId'],
        where: { customerId: { in: ids } },
        _count: { _all: true },
        _max: { createdAt: true },
      }),
      this.prisma.order.groupBy({
        by: ['customerId'],
        where: { customerId: { in: ids }, status: REALIZED_STATUSES },
        _sum: { total: true },
      }),
    ]);
    const ordersById = new Map(
      orderStats.map((s) => [s.customerId as string, s]),
    );
    const revenueById = new Map(
      revenueStats.map((s) => [s.customerId as string, s._sum.total]),
    );
    return customers.map((c) => {
      const orders = ordersById.get(c.id);
      return {
        ...c,
        orderCount: orders?._count._all ?? 0,
        totalSpent: revenueById.get(c.id) ?? 0,
        lastOrderAt: orders?._max.createdAt ?? null,
      };
    });
  }

  private countByKey(rows: { key: string; count: number }[]) {
    return rows.reduce<Record<string, number>>((acc, { key, count }) => {
      acc[key] = count;
      return acc;
    }, {});
  }

  private async ensureStoreExists(id: string) {
    const exists = await this.prisma.store.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) {
      throw new NotFoundException('المتجر غير موجود');
    }
  }
}
