import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../../generated/prisma';
import type {
  InventoryProductsQueryDto,
  StockMovementsQueryDto,
  TransactionsQueryDto,
} from './dto/merchant-reports.schemas';

// Falls back to the same low-stock threshold already used across the
// storefront (ProductCard/ProductInfo) when a product has no explicit
// InventoryItem.reorderLevel configured yet (reorder levels aren't editable
// anywhere in the UI as of this phase, so this is the realistic default).
const DEFAULT_LOW_STOCK_THRESHOLD = 5;

@Injectable()
export class InventoryReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(storeId: string) {
    const items = await this.prisma.inventoryItem.findMany({
      where: { storeId },
      select: {
        quantity: true,
        reserved: true,
        available: true,
        damaged: true,
        incoming: true,
        reorderLevel: true,
        product: { select: { isActive: true, price: true } },
      },
    });

    let totalUnits = 0;
    let availableUnits = 0;
    let reservedUnits = 0;
    let damagedUnits = 0;
    let incomingUnits = 0;
    let outOfStockCount = 0;
    let lowStockCount = 0;
    let inStockCount = 0;
    let estimatedRetailValue = 0;

    for (const item of items) {
      if (!item.product.isActive) continue;
      const available = Number(item.available);
      totalUnits += Number(item.quantity);
      availableUnits += available;
      reservedUnits += Number(item.reserved);
      damagedUnits += Number(item.damaged);
      incomingUnits += Number(item.incoming);
      estimatedRetailValue += available * Number(item.product.price);

      const threshold =
        item.reorderLevel > 0 ? item.reorderLevel : DEFAULT_LOW_STOCK_THRESHOLD;
      if (available <= 0) outOfStockCount += 1;
      else if (available <= threshold) lowStockCount += 1;
      else inStockCount += 1;
    }

    return {
      totals: {
        totalUnits,
        availableUnits,
        reservedUnits,
        damagedUnits,
        incomingUnits,
        estimatedRetailValue: Number(estimatedRetailValue.toFixed(2)),
      },
      productCounts: {
        total: items.length,
        inStock: inStockCount,
        lowStock: lowStockCount,
        outOfStock: outOfStockCount,
      },
    };
  }

  async products(storeId: string, query: InventoryProductsQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: Prisma.InventoryItemWhereInput = {
      storeId,
      product: query.search
        ? { name: { contains: query.search, mode: 'insensitive' } }
        : undefined,
    };
    if (query.status === 'OUT_OF_STOCK') where.available = { lte: 0 };
    if (query.status === 'LOW_STOCK') {
      where.available = { gt: 0, lte: DEFAULT_LOW_STOCK_THRESHOLD };
    }
    if (query.status === 'IN_STOCK') {
      where.available = { gt: DEFAULT_LOW_STOCK_THRESHOLD };
    }

    const [items, total] = await Promise.all([
      this.prisma.inventoryItem.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          quantity: true,
          reserved: true,
          available: true,
          damaged: true,
          incoming: true,
          updatedAt: true,
          product: {
            select: {
              id: true,
              name: true,
              price: true,
              isActive: true,
              totalSold: true,
              images: {
                select: { url: true },
                orderBy: { sortOrder: 'asc' },
                take: 1,
              },
              category: { select: { name: true } },
            },
          },
          warehouse: { select: { name: true } },
        },
      }),
      this.prisma.inventoryItem.count({ where }),
    ]);

    return {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      rows: items.map((item) => {
        const threshold = DEFAULT_LOW_STOCK_THRESHOLD;
        const available = Number(item.available);
        const status =
          available <= 0
            ? 'OUT_OF_STOCK'
            : available <= threshold
              ? 'LOW_STOCK'
              : 'IN_STOCK';
        return {
          productId: item.product.id,
          name: item.product.name,
          image: item.product.images[0]?.url ?? null,
          category: item.product.category?.name ?? null,
          warehouse: item.warehouse.name,
          isActive: item.product.isActive,
          price: Number(item.product.price),
          totalSold: item.product.totalSold,
          quantity: Number(item.quantity),
          reserved: Number(item.reserved),
          available,
          damaged: Number(item.damaged),
          incoming: Number(item.incoming),
          retailValue: Number((available * Number(item.product.price)).toFixed(2)),
          status,
          lastUpdated: item.updatedAt,
        };
      }),
    };
  }

  async productPerformance(storeId: string) {
    const products = await this.prisma.product.findMany({
      where: { storeId, isActive: true },
      select: {
        id: true,
        name: true,
        totalSold: true,
        price: true,
        inventoryItems: { select: { available: true } },
      },
    });

    const withStock = products.map((p) => ({
      productId: p.id,
      name: p.name,
      totalSold: p.totalSold,
      price: Number(p.price),
      available: p.inventoryItems.reduce((s, i) => s + Number(i.available), 0),
    }));

    const topSellers = [...withStock]
      .sort((a, b) => b.totalSold - a.totalSold)
      .slice(0, 10)
      .filter((p) => p.totalSold > 0);

    const noSales = withStock.filter((p) => p.totalSold === 0);

    // High stock but little/no demand — worth a merchant's attention even
    // though we can't compute "days of inventory" without cost/velocity
    // history; this is a simple, honest available-vs-sold heuristic.
    const highStockLowSales = withStock
      .filter((p) => p.available >= 10 && p.totalSold <= 2)
      .sort((a, b) => b.available - a.available)
      .slice(0, 10);

    return { topSellers, noSales, highStockLowSales };
  }

  async stockMovements(storeId: string, query: StockMovementsQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 30;

    const where: Prisma.StockMovementWhereInput = { storeId };
    if (query.productId) where.productId = query.productId;
    if (query.type) where.type = query.type;

    const [rows, total] = await Promise.all([
      this.prisma.stockMovement.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          type: true,
          quantityBefore: true,
          quantityChanged: true,
          quantityAfter: true,
          relatedOrderId: true,
          reason: true,
          notes: true,
          referenceNumber: true,
          createdAt: true,
          product: { select: { id: true, name: true } },
          warehouse: { select: { name: true } },
        },
      }),
      this.prisma.stockMovement.count({ where }),
    ]);

    return {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      rows: rows.map((r) => ({
        ...r,
        quantityBefore: Number(r.quantityBefore),
        quantityChanged: Number(r.quantityChanged),
        quantityAfter: Number(r.quantityAfter),
      })),
    };
  }

  async transactions(storeId: string, query: TransactionsQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;

    const where: Prisma.OrderWhereInput = { storeId };
    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { guestName: { contains: query.search, mode: 'insensitive' } },
        { guestPhone: { contains: query.search, mode: 'insensitive' } },
        { customer: { name: { contains: query.search, mode: 'insensitive' } } },
        { id: { equals: query.search } },
      ];
    }

    const [rows, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          createdAt: true,
          status: true,
          paymentMethod: true,
          governorate: true,
          cityNameSnapshot: true,
          subtotal: true,
          shippingCost: true,
          total: true,
          guestName: true,
          customer: { select: { name: true } },
          _count: { select: { items: true } },
        },
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      rows: rows.map((o) => ({
        id: o.id,
        createdAt: o.createdAt,
        status: o.status,
        paymentMethod: o.paymentMethod,
        governorate: o.governorate,
        cityNameSnapshot: o.cityNameSnapshot,
        customerName: o.customer?.name ?? o.guestName ?? 'زبون',
        itemCount: o._count.items,
        subtotal: Number(o.subtotal),
        shippingCost: Number(o.shippingCost),
        total: Number(o.total),
      })),
    };
  }

  async warehouses(storeId: string) {
    const warehouses = await this.prisma.warehouse.findMany({
      where: { storeId },
      select: {
        id: true,
        name: true,
        type: true,
        isDefault: true,
        inventoryItems: {
          select: {
            quantity: true,
            available: true,
            reserved: true,
            damaged: true,
            product: { select: { isActive: true, price: true } },
          },
        },
      },
    });

    return warehouses.map((w) => {
      const activeItems = w.inventoryItems.filter((i) => i.product.isActive);
      return {
        id: w.id,
        name: w.name,
        type: w.type,
        isDefault: w.isDefault,
        productCount: activeItems.length,
        totalUnits: activeItems.reduce((s, i) => s + Number(i.quantity), 0),
        availableUnits: activeItems.reduce((s, i) => s + Number(i.available), 0),
        reservedUnits: activeItems.reduce((s, i) => s + Number(i.reserved), 0),
        damagedUnits: activeItems.reduce((s, i) => s + Number(i.damaged), 0),
        retailValue: Number(
          activeItems
            .reduce((s, i) => s + Number(i.available) * Number(i.product.price), 0)
            .toFixed(2),
        ),
      };
    });
  }

  async returnsAndDamages(storeId: string, query: StockMovementsQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 30;
    const types: Prisma.StockMovementWhereInput['type'] = {
      in: ['DAMAGED', 'LOST', 'RETURN_TO_STOCK', 'DAMAGED_RETURN'],
    };
    const where: Prisma.StockMovementWhereInput = { storeId, type: types };
    if (query.productId) where.productId = query.productId;

    const [rows, total, totalsByType] = await Promise.all([
      this.prisma.stockMovement.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          type: true,
          quantityChanged: true,
          relatedOrderId: true,
          reason: true,
          createdAt: true,
          product: { select: { id: true, name: true } },
          warehouse: { select: { name: true } },
        },
      }),
      this.prisma.stockMovement.count({ where }),
      this.prisma.stockMovement.groupBy({
        by: ['type'],
        where: { storeId, type: types },
        _sum: { quantityChanged: true },
        _count: { _all: true },
      }),
    ]);

    const totals = {
      damaged: 0,
      lost: 0,
      returnedToStock: 0,
      damagedReturns: 0,
    };
    for (const t of totalsByType) {
      const qty = Math.abs(Number(t._sum.quantityChanged ?? 0));
      if (t.type === 'DAMAGED') totals.damaged = qty;
      if (t.type === 'LOST') totals.lost = qty;
      if (t.type === 'RETURN_TO_STOCK') totals.returnedToStock = qty;
      if (t.type === 'DAMAGED_RETURN') totals.damagedReturns = qty;
    }

    return {
      totals,
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      rows: rows.map((r) => ({
        ...r,
        quantityChanged: Number(r.quantityChanged),
      })),
    };
  }
}
