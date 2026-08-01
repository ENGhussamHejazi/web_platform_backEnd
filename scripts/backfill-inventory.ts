/**
 * One-time (idempotent) backfill for the inventory foundation added in the
 * add_inventory_foundation migration. Run once per environment after
 * deploying that migration and before merchants start delivering/cancelling
 * orders, so every in-flight order gets a StockReservation the new
 * commit/release logic can find.
 *
 * For each store:
 *   - ensure a default Warehouse exists
 *   - for each product, reconstruct an InventoryItem from the *current*
 *     ground truth (Product.stock = available right now) plus whatever is
 *     still reserved by non-terminal orders, so `available` doesn't change
 *     from what merchants see today.
 *   - for each still-active (non DELIVERED/CANCELLED) order item, create the
 *     matching StockReservation so a future status change resolves it
 *     correctly instead of finding nothing to commit/release.
 *
 * Safe to re-run: skips stores/products that already have a warehouse /
 * inventory item.
 */
import { OrderStatus, Prisma, PrismaClient } from '../generated/prisma';

const prisma = new PrismaClient();

const ACTIVE_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.CONFIRMED,
  OrderStatus.PROCESSING,
  OrderStatus.SHIPPED,
  OrderStatus.OUT_FOR_DELIVERY,
];

async function main() {
  const stores = await prisma.store.findMany({ select: { id: true, name: true } });
  let warehousesCreated = 0;
  let itemsCreated = 0;
  let reservationsCreated = 0;

  for (const store of stores) {
    let warehouse = await prisma.warehouse.findUnique({
      where: { storeId_code: { storeId: store.id, code: 'default' } },
    });
    if (!warehouse) {
      warehouse = await prisma.warehouse.create({
        data: {
          storeId: store.id,
          name: 'المستودع الرئيسي',
          code: 'default',
          type: 'BOTH',
          isDefault: true,
        },
      });
      warehousesCreated += 1;
    }

    const products = await prisma.product.findMany({
      where: { storeId: store.id },
      select: { id: true, stock: true },
    });

    for (const product of products) {
      const existing = await prisma.inventoryItem.findFirst({
        where: { warehouseId: warehouse.id, productId: product.id, variantId: null },
      });
      if (existing) continue;

      const activeItems = await prisma.orderItem.findMany({
        where: {
          productId: product.id,
          order: { status: { in: ACTIVE_ORDER_STATUSES } },
        },
        select: { quantity: true, orderId: true },
      });
      const reserved = activeItems.reduce(
        (sum, i) => sum.plus(i.quantity),
        new Prisma.Decimal(0),
      );
      const available = product.stock;
      const quantity = available.plus(reserved);

      await prisma.$transaction(async (tx) => {
        await tx.inventoryItem.create({
          data: {
            storeId: store.id,
            warehouseId: warehouse.id,
            productId: product.id,
            quantity,
            reserved,
            available,
          },
        });
        await tx.stockMovement.create({
          data: {
            storeId: store.id,
            warehouseId: warehouse.id,
            productId: product.id,
            type: 'OPENING_STOCK',
            quantityBefore: 0,
            quantityChanged: quantity,
            quantityAfter: quantity,
            reason: 'تهيئة أولية من رصيد المنتج (backfill)',
          },
        });
        for (const item of activeItems) {
          await tx.stockReservation.create({
            data: {
              storeId: store.id,
              warehouseId: warehouse.id,
              productId: product.id,
              orderId: item.orderId,
              quantity: item.quantity,
              status: 'ACTIVE',
            },
          });
          reservationsCreated += 1;
        }
      });
      itemsCreated += 1;
    }
  }

  console.log(
    `Backfill complete: ${stores.length} stores checked, ${warehousesCreated} warehouses created, ${itemsCreated} inventory items created, ${reservationsCreated} reservations reconstructed.`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
