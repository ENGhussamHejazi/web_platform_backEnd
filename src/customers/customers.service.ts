import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, Role } from '../../generated/prisma';
import type { ListCustomersQueryDto } from './dto/customers.schemas';

const CUSTOMER_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  avatarUrl: true,
  gender: true,
  dateOfBirth: true,
  preferredLanguage: true,
  loyaltyPoints: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

// Orders that represent realized revenue — mirrors AdminService.
const REALIZED_STATUSES: Prisma.OrderWhereInput['status'] = {
  in: ['DELIVERED'],
};

const ORDER_HISTORY_SELECT = {
  id: true,
  status: true,
  total: true,
  createdAt: true,
  governorate: true,
  cityNameSnapshot: true,
  _count: { select: { items: true } },
} satisfies Prisma.OrderSelect;

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  private async withStats<T extends { id: string }>(
    storeId: string,
    customers: T[],
  ) {
    if (customers.length === 0) return [];
    const ids = customers.map((c) => c.id);
    const [orderStats, revenueStats] = await Promise.all([
      this.prisma.order.groupBy({
        by: ['customerId'],
        where: { storeId, customerId: { in: ids } },
        _count: { _all: true },
        _max: { createdAt: true },
      }),
      this.prisma.order.groupBy({
        by: ['customerId'],
        where: { storeId, customerId: { in: ids }, status: REALIZED_STATUSES },
        _sum: { total: true },
      }),
    ]);
    const ordersById = new Map(orderStats.map((s) => [s.customerId as string, s]));
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

  async list(storeId: string, query: ListCustomersQueryDto) {
    const where: Prisma.UserWhereInput = { storeId, role: Role.CUSTOMER };
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
      select: CUSTOMER_SELECT,
    });

    return this.withStats(storeId, customers);
  }

  async get(storeId: string, id: string) {
    const customer = await this.prisma.user.findFirst({
      where: { id, storeId, role: Role.CUSTOMER },
      select: CUSTOMER_SELECT,
    });
    if (!customer) {
      throw new NotFoundException('العميل غير موجود');
    }

    const [withStats, orders] = await Promise.all([
      this.withStats(storeId, [customer]).then((r) => r[0]),
      this.prisma.order.findMany({
        where: { storeId, customerId: id },
        orderBy: { createdAt: 'desc' },
        select: ORDER_HISTORY_SELECT,
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
}
