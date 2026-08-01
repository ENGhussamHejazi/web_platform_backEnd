-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "clientRequestId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "orders_storeId_clientRequestId_key" ON "orders"("storeId", "clientRequestId");

