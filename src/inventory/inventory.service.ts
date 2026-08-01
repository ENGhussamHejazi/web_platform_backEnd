import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, StockMovementType } from '../../generated/prisma';

type Tx = Prisma.TransactionClient;

@Injectable()
export class InventoryService {
  /**
   * Returns the store's single default warehouse, creating it if this store
   * predates the inventory module. Multi-warehouse stores (once that UI
   * exists) will look this up by other means — this helper only covers the
   * "every store has exactly one stock location" bootstrap case.
   */
  async getOrCreateDefaultWarehouse(tx: Tx, storeId: string) {
    const existing = await tx.warehouse.findFirst({
      where: { storeId, isDefault: true },
    });
    if (existing) return existing;
    return tx.warehouse.create({
      data: {
        storeId,
        name: 'المستودع الرئيسي',
        type: 'BOTH',
        isDefault: true,
      },
    });
  }

  async getOrCreateInventoryItem(
    tx: Tx,
    storeId: string,
    warehouseId: string,
    productId: string,
    variantId?: string,
  ) {
    const existing = await tx.inventoryItem.findFirst({
      where: { warehouseId, productId, variantId: variantId ?? null },
    });
    if (existing) return existing;

    // Bootstrap from the product's (or variant's) current stock cache the
    // first time this product/variant is touched by the inventory system.
    const openingStock = variantId
      ? (
          await tx.productVariant.findUniqueOrThrow({
            where: { id: variantId },
            select: { stock: true },
          })
        ).stock
      : (
          await tx.product.findUniqueOrThrow({
            where: { id: productId },
            select: { stock: true },
          })
        ).stock;
    const item = await tx.inventoryItem.create({
      data: {
        storeId,
        warehouseId,
        productId,
        variantId: variantId ?? null,
        quantity: openingStock,
        reserved: 0,
        available: openingStock,
      },
    });
    await tx.stockMovement.create({
      data: {
        storeId,
        warehouseId,
        productId,
        variantId: variantId ?? null,
        type: StockMovementType.OPENING_STOCK,
        quantityBefore: 0,
        quantityChanged: openingStock,
        quantityAfter: openingStock,
        reason: 'تهيئة أولية من رصيد المنتج',
      },
    });
    return item;
  }

  /**
   * Atomically holds `quantity` units of `productId` for `orderId` — moves
   * units from `available` into `reserved` without touching physical
   * `quantity`. Throws BadRequestException (same message shape the old
   * direct-decrement code used) if not enough is available. Keeps
   * `Product.stock` synced to the new `available` so existing UI reads
   * (storefront stock badge, cart max-qty, merchant low-stock flag) keep
   * working unchanged.
   */
  async reserveForOrder(
    tx: Tx,
    params: {
      storeId: string;
      productId: string;
      variantId?: string;
      productName: string;
      quantity: number;
      orderId: string;
    },
  ): Promise<void> {
    const warehouse = await this.getOrCreateDefaultWarehouse(
      tx,
      params.storeId,
    );
    const item = await this.getOrCreateInventoryItem(
      tx,
      params.storeId,
      warehouse.id,
      params.productId,
      params.variantId,
    );

    const updated = await tx.inventoryItem.updateMany({
      where: { id: item.id, available: { gte: params.quantity } },
      data: {
        available: { decrement: params.quantity },
        reserved: { increment: params.quantity },
      },
    });
    if (updated.count === 0) {
      throw new BadRequestException(
        `الكمية المطلوبة من "${params.productName}" غير متوفرة`,
      );
    }
    // Once a product has variants, Product.stock can no longer represent
    // "stock" on its own (it can't sum variants without double-counting
    // across warehouses) — mirror the decrement onto the variant instead.
    if (params.variantId) {
      await tx.productVariant.update({
        where: { id: params.variantId },
        data: { stock: { decrement: params.quantity } },
      });
    } else {
      await tx.product.update({
        where: { id: params.productId },
        data: { stock: { decrement: params.quantity } },
      });
    }

    await tx.stockMovement.create({
      data: {
        storeId: params.storeId,
        warehouseId: warehouse.id,
        productId: params.productId,
        variantId: params.variantId ?? null,
        type: StockMovementType.ORDER_RESERVATION,
        quantityBefore: item.reserved,
        quantityChanged: params.quantity,
        quantityAfter: item.reserved.plus(params.quantity),
        relatedOrderId: params.orderId,
        reason: 'حجز مخزون عند إنشاء الطلب',
      },
    });
    await tx.stockReservation.create({
      data: {
        storeId: params.storeId,
        warehouseId: warehouse.id,
        productId: params.productId,
        variantId: params.variantId ?? null,
        orderId: params.orderId,
        quantity: params.quantity,
        status: 'ACTIVE',
      },
    });
  }

  /**
   * Order delivered: the reservation is consumed for real — physical
   * `quantity` leaves the warehouse, `reserved` drops to match. `available`
   * (and the Product.stock mirror) were already decremented at reservation
   * time, so neither changes here.
   */
  async commitSale(tx: Tx, orderId: string): Promise<void> {
    const reservations = await tx.stockReservation.findMany({
      where: { orderId, status: 'ACTIVE' },
    });
    for (const r of reservations) {
      const item = await tx.inventoryItem.findFirst({
        where: {
          warehouseId: r.warehouseId,
          productId: r.productId,
          variantId: r.variantId,
        },
      });
      if (!item) continue;

      await tx.inventoryItem.update({
        where: { id: item.id },
        data: {
          quantity: { decrement: r.quantity },
          reserved: { decrement: r.quantity },
        },
      });
      await tx.stockMovement.create({
        data: {
          storeId: r.storeId,
          warehouseId: r.warehouseId,
          productId: r.productId,
          variantId: r.variantId,
          type: StockMovementType.SALE,
          quantityBefore: item.quantity,
          quantityChanged: r.quantity.negated(),
          quantityAfter: item.quantity.minus(r.quantity),
          relatedOrderId: orderId,
          reason: 'تسليم الطلب',
        },
      });
      await tx.stockReservation.update({
        where: { id: r.id },
        data: { status: 'COMMITTED', resolvedAt: new Date() },
      });
    }
  }

  /**
   * Order cancelled before delivery: gives the held units back to
   * `available` (and the Product.stock mirror) without ever having touched
   * physical `quantity`. This is the fix for the pre-existing gap where
   * cancelling an order never restored stock.
   */
  async releaseReservation(tx: Tx, orderId: string): Promise<void> {
    const reservations = await tx.stockReservation.findMany({
      where: { orderId, status: 'ACTIVE' },
    });
    for (const r of reservations) {
      const item = await tx.inventoryItem.findFirst({
        where: {
          warehouseId: r.warehouseId,
          productId: r.productId,
          variantId: r.variantId,
        },
      });
      if (!item) continue;

      await tx.inventoryItem.update({
        where: { id: item.id },
        data: {
          available: { increment: r.quantity },
          reserved: { decrement: r.quantity },
        },
      });
      if (r.variantId) {
        await tx.productVariant.update({
          where: { id: r.variantId },
          data: { stock: { increment: r.quantity } },
        });
      } else {
        await tx.product.update({
          where: { id: r.productId },
          data: { stock: { increment: r.quantity } },
        });
      }
      await tx.stockMovement.create({
        data: {
          storeId: r.storeId,
          warehouseId: r.warehouseId,
          productId: r.productId,
          variantId: r.variantId,
          type: StockMovementType.RESERVATION_RELEASE,
          quantityBefore: item.reserved,
          quantityChanged: r.quantity.negated(),
          quantityAfter: item.reserved.minus(r.quantity),
          relatedOrderId: orderId,
          reason: 'إلغاء الطلب',
        },
      });
      await tx.stockReservation.update({
        where: { id: r.id },
        data: { status: 'RELEASED', resolvedAt: new Date() },
      });
    }
  }

  /**
   * Manual, merchant-initiated stock adjustment — damage/loss recording and
   * post-delivery return restocking. Always goes through this one path so
   * every change is ledgered the same way as the automatic order flow.
   *
   *  - DAMAGED: units leave `available` and move into the `damaged` bucket
   *    (still physically on the shelf, just unsellable). `quantity` is
   *    unchanged since nothing left the warehouse.
   *  - LOST: units leave both `available` and `quantity` — gone for good,
   *    there's no bucket to move them into.
   *  - RETURN_TO_STOCK: a customer return that's sellable again — units are
   *    added to both `available` and `quantity`.
   *  - DAMAGED_RETURN: a customer return that arrived damaged — units are
   *    added to `quantity` and the `damaged` bucket, not `available`.
   */
  async adjustStock(
    tx: Tx,
    params: {
      storeId: string;
      productId: string;
      variantId?: string;
      quantity: number;
      type: 'DAMAGED' | 'LOST' | 'RETURN_TO_STOCK' | 'DAMAGED_RETURN';
      reason: string;
      relatedOrderId?: string;
    },
  ): Promise<void> {
    const warehouse = await this.getOrCreateDefaultWarehouse(
      tx,
      params.storeId,
    );
    const item = await this.getOrCreateInventoryItem(
      tx,
      params.storeId,
      warehouse.id,
      params.productId,
      params.variantId,
    );

    if (
      (params.type === 'DAMAGED' || params.type === 'LOST') &&
      item.available.lessThan(params.quantity)
    ) {
      throw new BadRequestException(
        'الكمية المطلوبة أكبر من الكمية المتاحة حالياً لهذا المنتج',
      );
    }

    let data: Prisma.InventoryItemUpdateInput;
    let stockDelta: number; // change applied to Product.stock (mirrors `available`)
    let quantityBefore: Prisma.Decimal;
    let quantityAfter: Prisma.Decimal;

    switch (params.type) {
      case 'DAMAGED':
        data = {
          available: { decrement: params.quantity },
          damaged: { increment: params.quantity },
        };
        stockDelta = -params.quantity;
        quantityBefore = item.damaged;
        quantityAfter = item.damaged.plus(params.quantity);
        break;
      case 'LOST':
        data = {
          available: { decrement: params.quantity },
          quantity: { decrement: params.quantity },
        };
        stockDelta = -params.quantity;
        quantityBefore = item.quantity;
        quantityAfter = item.quantity.minus(params.quantity);
        break;
      case 'RETURN_TO_STOCK':
        data = {
          available: { increment: params.quantity },
          quantity: { increment: params.quantity },
        };
        stockDelta = params.quantity;
        quantityBefore = item.quantity;
        quantityAfter = item.quantity.plus(params.quantity);
        break;
      case 'DAMAGED_RETURN':
        data = {
          damaged: { increment: params.quantity },
          quantity: { increment: params.quantity },
        };
        stockDelta = 0;
        quantityBefore = item.damaged;
        quantityAfter = item.damaged.plus(params.quantity);
        break;
    }

    await tx.inventoryItem.update({ where: { id: item.id }, data });
    if (stockDelta !== 0) {
      if (params.variantId) {
        await tx.productVariant.update({
          where: { id: params.variantId },
          data: { stock: { increment: stockDelta } },
        });
      } else {
        await tx.product.update({
          where: { id: params.productId },
          data: { stock: { increment: stockDelta } },
        });
      }
    }

    await tx.stockMovement.create({
      data: {
        storeId: params.storeId,
        warehouseId: warehouse.id,
        productId: params.productId,
        variantId: params.variantId ?? null,
        type: StockMovementType[params.type],
        quantityBefore,
        quantityChanged:
          params.type === 'LOST' ? -params.quantity : params.quantity,
        quantityAfter,
        relatedOrderId: params.relatedOrderId,
        reason: params.reason,
      },
    });
  }
}
