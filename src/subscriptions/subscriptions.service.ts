import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, SubscriptionStatus } from '../../generated/prisma';
import { computeSubscriptionEnd } from '../common/subscription.util';
import {
  AddSubscriptionNoteDto,
  CancelSubscriptionDto,
  ChangePackageDto,
  ExportSubscriptionsQueryDto,
  ExtendSubscriptionDto,
  ListSubscriptionsQueryDto,
  SubscriptionsAnalyticsQueryDto,
  SuspendSubscriptionDto,
  UpdatePaymentStatusDto,
} from './dto/subscriptions.schemas';

const EXPIRING_SOON_DAYS = 7;

const SUBSCRIPTION_INCLUDE = {
  store: {
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      billingCycle: true,
      subscriptionStartAt: true,
      subscriptionEndAt: true,
      currency: true,
      owner: {
        select: { id: true, name: true, email: true, phone: true },
      },
      _count: { select: { products: true, orders: true } },
    },
  },
  plan: true,
} satisfies Prisma.SubscriptionInclude;

type SubscriptionWithRelations = Prisma.SubscriptionGetPayload<{
  include: typeof SUBSCRIPTION_INCLUDE;
}>;

// Which stored statuses an action may transition *from*. Used to reject
// nonsensical transitions (e.g. reactivating a cancelled subscription).
const ALLOWED_TRANSITIONS: Record<string, SubscriptionStatus[]> = {
  suspend: ['TRIAL', 'ACTIVE', 'PENDING_PAYMENT'],
  reactivate: ['SUSPENDED'],
  cancel: ['TRIAL', 'ACTIVE', 'SUSPENDED', 'PENDING_PAYMENT'],
  renew: ['TRIAL', 'ACTIVE', 'PENDING_PAYMENT'],
  extend: ['TRIAL', 'ACTIVE', 'PENDING_PAYMENT'],
  changePackage: ['TRIAL', 'ACTIVE', 'PENDING_PAYMENT'],
};

@Injectable()
export class SubscriptionsService {
  constructor(private readonly prisma: PrismaService) {}

  private assertTransition(action: keyof typeof ALLOWED_TRANSITIONS, current: SubscriptionStatus) {
    const allowed = ALLOWED_TRANSITIONS[action];
    if (!allowed.includes(current)) {
      throw new BadRequestException(
        `لا يمكن تنفيذ هذا الإجراء على اشتراك بحالة "${current}"`,
      );
    }
  }

  private computeDaysLeft(endAt: Date | null): number | null {
    if (!endAt) return null;
    const ms = endAt.getTime() - Date.now();
    return Math.ceil(ms / (1000 * 60 * 60 * 24));
  }

  private computeEffectiveStatus(
    status: SubscriptionStatus,
    daysLeft: number | null,
  ): { effectiveStatus: string; expiringSoon: boolean } {
    if (status === 'SUSPENDED' || status === 'CANCELLED' || status === 'PENDING_PAYMENT') {
      return { effectiveStatus: status, expiringSoon: false };
    }
    if (daysLeft !== null && daysLeft < 0) {
      return { effectiveStatus: 'EXPIRED', expiringSoon: false };
    }
    const expiringSoon = daysLeft !== null && daysLeft <= EXPIRING_SOON_DAYS;
    return { effectiveStatus: status, expiringSoon };
  }

  private serialize(sub: SubscriptionWithRelations) {
    const daysLeft = this.computeDaysLeft(sub.store.subscriptionEndAt);
    const { effectiveStatus, expiringSoon } = this.computeEffectiveStatus(
      sub.status,
      daysLeft,
    );
    return {
      id: sub.id,
      storeId: sub.storeId,
      store: {
        id: sub.store.id,
        name: sub.store.name,
        slug: sub.store.slug,
        status: sub.store.status,
      },
      merchant: sub.store.owner,
      plan: sub.plan
        ? {
            id: sub.plan.id,
            name: sub.plan.name,
            key: sub.plan.key,
            maxProducts: sub.plan.maxProducts,
            features: sub.plan.features,
          }
        : null,
      status: sub.status,
      effectiveStatus,
      expiringSoon,
      paymentStatus: sub.paymentStatus,
      renewalType: sub.renewalType,
      billingCycle: sub.store.billingCycle,
      startAt: sub.store.subscriptionStartAt,
      endAt: sub.store.subscriptionEndAt,
      daysLeft,
      basePrice: Number(sub.basePrice),
      discount: Number(sub.discount),
      tax: Number(sub.tax),
      finalAmount: Number(sub.finalAmount),
      currency: sub.currency,
      lastPaymentAt: sub.lastPaymentAt,
      nextRenewalAt: sub.nextRenewalAt,
      cancelledAt: sub.cancelledAt,
      cancelReason: sub.cancelReason,
      suspendedAt: sub.suspendedAt,
      suspendReason: sub.suspendReason,
      createdAt: sub.createdAt,
      updatedAt: sub.updatedAt,
      productCount: sub.store._count.products,
      orderCount: sub.store._count.orders,
    };
  }

  /** Fetch every subscription matching the cheap DB-pushable filters, then
   * apply the remaining filters (date ranges, price range, expiring-within,
   * derived-status, free-text search) in memory. This project's store count
   * is modest, so this keeps the derived-status/date logic in one place
   * instead of duplicating it as raw SQL. */
  private async fetchFiltered(query: {
    search?: string;
    planId?: string;
    status?: string;
    billingCycle?: string;
    paymentStatus?: string;
    renewalType?: string;
    startDateFrom?: string;
    startDateTo?: string;
    expirationDateFrom?: string;
    expirationDateTo?: string;
    expiringWithinDays?: number;
    priceMin?: number;
    priceMax?: number;
  }) {
    const where: Prisma.SubscriptionWhereInput = {};
    if (query.planId) where.planId = query.planId;
    if (query.paymentStatus) where.paymentStatus = query.paymentStatus as never;
    if (query.renewalType) where.renewalType = query.renewalType as never;
    if (query.status && query.status !== 'EXPIRED') {
      where.status = query.status as never;
    }
    if (query.billingCycle) {
      where.store = { billingCycle: query.billingCycle as never };
    }

    const all = await this.prisma.subscription.findMany({
      where,
      include: SUBSCRIPTION_INCLUDE,
    });

    let items = all.map((sub) => this.serialize(sub));

    if (query.search) {
      const q = query.search.trim().toLowerCase();
      items = items.filter(
        (s) =>
          s.store.name.toLowerCase().includes(q) ||
          s.merchant.name.toLowerCase().includes(q) ||
          s.merchant.email.toLowerCase().includes(q) ||
          (s.merchant.phone ?? '').toLowerCase().includes(q) ||
          s.id.toLowerCase().includes(q),
      );
    }
    if (query.status === 'EXPIRED') {
      items = items.filter((s) => s.effectiveStatus === 'EXPIRED');
    }
    if (query.startDateFrom) {
      const from = new Date(query.startDateFrom);
      items = items.filter((s) => s.startAt && s.startAt >= from);
    }
    if (query.startDateTo) {
      const to = new Date(query.startDateTo);
      items = items.filter((s) => s.startAt && s.startAt <= to);
    }
    if (query.expirationDateFrom) {
      const from = new Date(query.expirationDateFrom);
      items = items.filter((s) => s.endAt && s.endAt >= from);
    }
    if (query.expirationDateTo) {
      const to = new Date(query.expirationDateTo);
      items = items.filter((s) => s.endAt && s.endAt <= to);
    }
    if (query.expiringWithinDays !== undefined) {
      items = items.filter(
        (s) =>
          s.daysLeft !== null &&
          s.daysLeft >= 0 &&
          s.daysLeft <= query.expiringWithinDays!,
      );
    }
    if (query.priceMin !== undefined) {
      items = items.filter((s) => s.finalAmount >= query.priceMin!);
    }
    if (query.priceMax !== undefined) {
      items = items.filter((s) => s.finalAmount <= query.priceMax!);
    }

    return items;
  }

  async list(query: ListSubscriptionsQueryDto) {
    const items = await this.fetchFiltered(query);

    const sortKey = (s: ReturnType<typeof this.serialize>) => {
      switch (query.sortBy) {
        case 'startAt':
          return s.startAt?.getTime() ?? 0;
        case 'endAt':
        case 'daysLeft':
          return s.endAt?.getTime() ?? 0;
        case 'price':
          return s.finalAmount;
        case 'status':
          return s.effectiveStatus;
        case 'store':
          return s.store.name;
        case 'createdAt':
        default:
          return s.createdAt.getTime();
      }
    };
    items.sort((a, b) => {
      const av = sortKey(a);
      const bv = sortKey(b);
      const dir = query.sortDir === 'asc' ? 1 : -1;
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });

    const total = items.length;
    const start = (query.page - 1) * query.pageSize;
    const paged = items.slice(start, start + query.pageSize);

    return { items: paged, total, page: query.page, pageSize: query.pageSize };
  }

  async summary(query: Omit<ListSubscriptionsQueryDto, 'sortBy' | 'sortDir' | 'page' | 'pageSize'>) {
    const items = await this.fetchFiltered(query);
    const totalRevenue = items.reduce((sum, s) => sum + s.finalAmount, 0);
    const count = (status: string) =>
      items.filter((s) => s.effectiveStatus === status).length;

    return {
      total: items.length,
      active: count('ACTIVE'),
      trial: count('TRIAL'),
      expired: count('EXPIRED'),
      cancelled: count('CANCELLED'),
      expiringSoon: items.filter((s) => s.expiringSoon).length,
      suspended: count('SUSPENDED'),
      pendingPayment: count('PENDING_PAYMENT'),
      totalRevenue,
    };
  }

  async analytics(query: SubscriptionsAnalyticsQueryDto) {
    const items = await this.fetchFiltered(query);
    const periodStart = new Date();
    periodStart.setDate(periodStart.getDate() - query.periodDays);

    const inPeriod = items.filter((s) => s.createdAt >= periodStart);
    const newCount = inPeriod.length;

    const activities = await this.prisma.subscriptionActivity.findMany({
      where: {
        subscriptionId: { in: items.map((i) => i.id) },
        createdAt: { gte: periodStart },
      },
      select: { subscriptionId: true, type: true, createdAt: true },
    });
    const renewedCount = activities.filter((a) => a.type === 'RENEWED').length;
    const cancelledCount = activities.filter((a) => a.type === 'CANCELLED').length;
    const expiredCount = items.filter((s) => s.effectiveStatus === 'EXPIRED').length;

    const trialTotal = items.filter((s) => s.status === 'TRIAL' || activities.some((a) => a.subscriptionId === s.id)).length;
    const trialToPaid = activities.filter(
      (a) => a.type === 'PACKAGE_UPGRADED' || a.type === 'RENEWED',
    ).length;
    const trialCount = items.filter((s) => s.status === 'TRIAL').length;
    const trialConversionRate =
      trialCount + trialToPaid > 0
        ? (trialToPaid / (trialCount + trialToPaid)) * 100
        : 0;

    const renewalEligible = items.filter((s) => s.effectiveStatus !== 'CANCELLED').length;
    const renewalRate = renewalEligible > 0 ? (renewedCount / renewalEligible) * 100 : 0;
    const cancellationRate = items.length > 0 ? (cancelledCount / items.length) * 100 : 0;

    const revenue = items.reduce((sum, s) => sum + s.finalAmount, 0);

    const revenueByPackage: Record<string, number> = {};
    const subsByPackage: Record<string, number> = {};
    const subsByStatus: Record<string, number> = {};
    const subsByBillingCycle: Record<string, number> = {};
    for (const s of items) {
      const planName = s.plan?.name ?? 'بدون باقة';
      revenueByPackage[planName] = (revenueByPackage[planName] ?? 0) + s.finalAmount;
      subsByPackage[planName] = (subsByPackage[planName] ?? 0) + 1;
      subsByStatus[s.effectiveStatus] = (subsByStatus[s.effectiveStatus] ?? 0) + 1;
      const cycle = s.billingCycle ?? 'غير محدد';
      subsByBillingCycle[cycle] = (subsByBillingCycle[cycle] ?? 0) + 1;
    }

    // Growth + revenue time series over the period, bucketed by day.
    const days = Math.min(query.periodDays, 90);
    const growthSeries: { date: string; count: number; revenue: number }[] = [];
    for (let i = days - 1; i >= 0; i -= 1) {
      const day = new Date();
      day.setDate(day.getDate() - i);
      day.setHours(0, 0, 0, 0);
      const nextDay = new Date(day);
      nextDay.setDate(nextDay.getDate() + 1);
      const dayItems = items.filter((s) => s.createdAt >= day && s.createdAt < nextDay);
      growthSeries.push({
        date: day.toISOString().slice(0, 10),
        count: dayItems.length,
        revenue: dayItems.reduce((sum, s) => sum + s.finalAmount, 0),
      });
    }

    return {
      newSubscriptions: newCount,
      renewedSubscriptions: renewedCount,
      expiredSubscriptions: expiredCount,
      cancelledSubscriptions: cancelledCount,
      trialToPaidConversionRate: Math.round(trialConversionRate * 10) / 10,
      renewalRate: Math.round(renewalRate * 10) / 10,
      cancellationRate: Math.round(cancellationRate * 10) / 10,
      revenue,
      revenueByPackage,
      subscriptionsByPackage: subsByPackage,
      subscriptionsByStatus: subsByStatus,
      subscriptionsByBillingCycle: subsByBillingCycle,
      growthSeries,
    };
  }

  private async findOrThrow(id: string) {
    const sub = await this.prisma.subscription.findUnique({
      where: { id },
      include: SUBSCRIPTION_INCLUDE,
    });
    if (!sub) {
      throw new NotFoundException('الاشتراك غير موجود');
    }
    return sub;
  }

  async getDetail(id: string) {
    const sub = await this.findOrThrow(id);
    const [payments, invoices, packageChanges, activities, notes] =
      await Promise.all([
        this.prisma.subscriptionPayment.findMany({
          where: { subscriptionId: id },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.subscriptionInvoice.findMany({
          where: { subscriptionId: id },
          orderBy: { issuedAt: 'desc' },
        }),
        this.prisma.subscriptionPackageChange.findMany({
          where: { subscriptionId: id },
          include: { fromPlan: true, toPlan: true },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.subscriptionActivity.findMany({
          where: { subscriptionId: id },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.subscriptionNote.findMany({
          where: { subscriptionId: id },
          orderBy: { createdAt: 'desc' },
        }),
      ]);

    return {
      ...this.serialize(sub),
      payments: payments.map((p) => ({ ...p, amount: Number(p.amount) })),
      invoices: invoices.map((inv) => ({
        ...inv,
        amount: Number(inv.amount),
        discount: Number(inv.discount),
        tax: Number(inv.tax),
        finalAmount: Number(inv.finalAmount),
      })),
      packageChanges,
      activities,
      notes,
    };
  }

  private async logActivity(
    tx: Prisma.TransactionClient,
    params: {
      subscriptionId: string;
      storeId: string;
      type: Prisma.SubscriptionActivityCreateInput['type'];
      actorId?: string | null;
      title: string;
      description?: string;
      previousValue?: string;
      newValue?: string;
    },
  ) {
    await tx.subscriptionActivity.create({ data: params });
  }

  async renew(id: string, actorId: string | null) {
    const sub = await this.findOrThrow(id);
    this.assertTransition('renew', sub.status);

    return this.prisma.$transaction(async (tx) => {
      const start = new Date();
      const end = computeSubscriptionEnd(start, sub.store.billingCycle ?? 'MONTHLY');
      await tx.store.update({
        where: { id: sub.storeId },
        data: { subscriptionStartAt: start, subscriptionEndAt: end },
      });
      const updated = await tx.subscription.update({
        where: { id },
        data: {
          status: 'ACTIVE',
          lastPaymentAt: new Date(),
          nextRenewalAt: end,
        },
        include: SUBSCRIPTION_INCLUDE,
      });
      await this.logActivity(tx, {
        subscriptionId: id,
        storeId: sub.storeId,
        type: 'RENEWED',
        actorId,
        title: 'تجديد الاشتراك',
        previousValue: sub.store.subscriptionEndAt?.toISOString(),
        newValue: end.toISOString(),
      });
      return this.serialize(updated);
    });
  }

  async extend(id: string, dto: ExtendSubscriptionDto, actorId: string | null) {
    const sub = await this.findOrThrow(id);
    this.assertTransition('extend', sub.status);

    const currentEnd = sub.store.subscriptionEndAt ?? new Date();
    const newEnd = dto.newEndAt
      ? new Date(dto.newEndAt)
      : new Date(currentEnd.getTime() + dto.extendByDays! * 24 * 60 * 60 * 1000);
    if (newEnd <= currentEnd && dto.newEndAt) {
      throw new BadRequestException('يجب أن يكون التاريخ الجديد بعد تاريخ الانتهاء الحالي');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.store.update({
        where: { id: sub.storeId },
        data: { subscriptionEndAt: newEnd },
      });
      const updated = await tx.subscription.update({
        where: { id },
        data: { nextRenewalAt: newEnd },
        include: SUBSCRIPTION_INCLUDE,
      });
      await this.logActivity(tx, {
        subscriptionId: id,
        storeId: sub.storeId,
        type: 'EXTENDED',
        actorId,
        title: 'تمديد تاريخ انتهاء الاشتراك',
        previousValue: currentEnd.toISOString(),
        newValue: newEnd.toISOString(),
      });
      return this.serialize(updated);
    });
  }

  async changePackage(id: string, dto: ChangePackageDto, actorId: string | null) {
    const sub = await this.findOrThrow(id);
    this.assertTransition('changePackage', sub.status);

    const plan = await this.prisma.plan.findUnique({ where: { id: dto.planId } });
    if (!plan) {
      throw new NotFoundException('الباقة غير موجودة');
    }
    const billingCycle = dto.billingCycle ?? sub.store.billingCycle ?? 'MONTHLY';
    const basePrice = billingCycle === 'YEARLY' ? plan.priceYearly : plan.priceMonthly;
    const currentPrice = Number(sub.basePrice);
    const changeType =
      Number(basePrice) > currentPrice
        ? 'UPGRADE'
        : Number(basePrice) < currentPrice
          ? 'DOWNGRADE'
          : 'INITIAL';
    const start = new Date();
    const end = computeSubscriptionEnd(start, billingCycle);

    return this.prisma.$transaction(async (tx) => {
      await tx.store.update({
        where: { id: sub.storeId },
        data: {
          planId: plan.id,
          billingCycle,
          subscriptionStartAt: start,
          subscriptionEndAt: end,
        },
      });
      const updated = await tx.subscription.update({
        where: { id },
        data: {
          planId: plan.id,
          basePrice,
          finalAmount: basePrice,
          nextRenewalAt: end,
        },
        include: SUBSCRIPTION_INCLUDE,
      });
      await tx.subscriptionPackageChange.create({
        data: {
          subscriptionId: id,
          fromPlanId: sub.planId,
          toPlanId: plan.id,
          changeType,
          actorId,
          note: dto.note,
        },
      });
      await this.logActivity(tx, {
        subscriptionId: id,
        storeId: sub.storeId,
        type: changeType === 'DOWNGRADE' ? 'PACKAGE_DOWNGRADED' : 'PACKAGE_UPGRADED',
        actorId,
        title: changeType === 'DOWNGRADE' ? 'تخفيض الباقة' : 'ترقية الباقة',
        previousValue: sub.plan?.name,
        newValue: plan.name,
      });
      return this.serialize(updated);
    });
  }

  async suspend(id: string, dto: SuspendSubscriptionDto, actorId: string | null) {
    const sub = await this.findOrThrow(id);
    this.assertTransition('suspend', sub.status);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.subscription.update({
        where: { id },
        data: {
          status: 'SUSPENDED',
          suspendedAt: new Date(),
          suspendReason: dto.reason,
        },
        include: SUBSCRIPTION_INCLUDE,
      });
      await this.logActivity(tx, {
        subscriptionId: id,
        storeId: sub.storeId,
        type: 'SUSPENDED',
        actorId,
        title: 'تعليق الاشتراك',
        description: dto.reason,
        previousValue: sub.status,
        newValue: 'SUSPENDED',
      });
      return this.serialize(updated);
    });
  }

  async reactivate(id: string, actorId: string | null) {
    const sub = await this.findOrThrow(id);
    this.assertTransition('reactivate', sub.status);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.subscription.update({
        where: { id },
        data: {
          status: 'ACTIVE',
          suspendedAt: null,
          suspendReason: null,
        },
        include: SUBSCRIPTION_INCLUDE,
      });
      await this.logActivity(tx, {
        subscriptionId: id,
        storeId: sub.storeId,
        type: 'REACTIVATED',
        actorId,
        title: 'إعادة تفعيل الاشتراك',
        previousValue: sub.status,
        newValue: 'ACTIVE',
      });
      return this.serialize(updated);
    });
  }

  async cancel(id: string, dto: CancelSubscriptionDto, actorId: string | null) {
    const sub = await this.findOrThrow(id);
    this.assertTransition('cancel', sub.status);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.subscription.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelReason: dto.reason,
        },
        include: SUBSCRIPTION_INCLUDE,
      });
      await this.logActivity(tx, {
        subscriptionId: id,
        storeId: sub.storeId,
        type: 'CANCELLED',
        actorId,
        title: 'إلغاء الاشتراك',
        description: dto.reason,
        previousValue: sub.status,
        newValue: 'CANCELLED',
      });
      return this.serialize(updated);
    });
  }

  async updatePaymentStatus(
    id: string,
    dto: UpdatePaymentStatusDto,
    actorId: string | null,
  ) {
    const sub = await this.findOrThrow(id);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.subscription.update({
        where: { id },
        data: {
          paymentStatus: dto.status,
          ...(dto.status === 'PAID' ? { lastPaymentAt: new Date() } : {}),
        },
        include: SUBSCRIPTION_INCLUDE,
      });

      if (dto.status === 'PAID' && dto.amount !== undefined) {
        await tx.subscriptionPayment.create({
          data: {
            subscriptionId: id,
            amount: dto.amount,
            method: dto.method,
            reference: dto.reference,
            status: 'PAID',
            paidAt: new Date(),
          },
        });
        await this.logActivity(tx, {
          subscriptionId: id,
          storeId: sub.storeId,
          type: 'PAYMENT_RECORDED',
          actorId,
          title: 'تسجيل دفعة',
          newValue: String(dto.amount),
        });
      }

      await this.logActivity(tx, {
        subscriptionId: id,
        storeId: sub.storeId,
        type: 'PAYMENT_STATUS_CHANGED',
        actorId,
        title: 'تحديث حالة الدفع',
        previousValue: sub.paymentStatus,
        newValue: dto.status,
      });

      return this.serialize(updated);
    });
  }

  async addNote(id: string, dto: AddSubscriptionNoteDto, authorId: string) {
    const sub = await this.findOrThrow(id);
    return this.prisma.$transaction(async (tx) => {
      const note = await tx.subscriptionNote.create({
        data: {
          subscriptionId: id,
          storeId: sub.storeId,
          authorId,
          content: dto.content,
        },
      });
      await this.logActivity(tx, {
        subscriptionId: id,
        storeId: sub.storeId,
        type: 'NOTE_ADDED',
        actorId: authorId,
        title: 'إضافة ملاحظة داخلية',
      });
      return note;
    });
  }

  async getInvoice(id: string, invoiceId: string) {
    const invoice = await this.prisma.subscriptionInvoice.findFirst({
      where: { id: invoiceId, subscriptionId: id },
      include: {
        subscription: { include: SUBSCRIPTION_INCLUDE },
      },
    });
    if (!invoice) {
      throw new NotFoundException('الفاتورة غير موجودة');
    }
    return {
      ...invoice,
      amount: Number(invoice.amount),
      discount: Number(invoice.discount),
      tax: Number(invoice.tax),
      finalAmount: Number(invoice.finalAmount),
      subscription: this.serialize(invoice.subscription),
    };
  }

  async exportData(query: ExportSubscriptionsQueryDto) {
    const items = await this.fetchFiltered(query);
    const summary = await this.summary(query);
    return {
      exportDate: new Date().toISOString(),
      filters: query,
      summary,
      items,
    };
  }
}
