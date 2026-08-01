-- DropForeignKey
ALTER TABLE "purchase_order_items" DROP CONSTRAINT "purchase_order_items_purchaseOrderId_fkey";

-- DropForeignKey
ALTER TABLE "purchase_orders" DROP CONSTRAINT "purchase_orders_storeId_fkey";

-- DropForeignKey
ALTER TABLE "purchase_orders" DROP CONSTRAINT "purchase_orders_supplierId_fkey";

-- DropForeignKey
ALTER TABLE "purchase_orders" DROP CONSTRAINT "purchase_orders_warehouseId_fkey";

-- DropForeignKey
ALTER TABLE "suppliers" DROP CONSTRAINT "suppliers_storeId_fkey";

-- DropTable
DROP TABLE "purchase_order_items";

-- DropTable
DROP TABLE "purchase_orders";

-- DropTable
DROP TABLE "suppliers";

-- DropEnum
DROP TYPE "PurchaseOrderStatus";
