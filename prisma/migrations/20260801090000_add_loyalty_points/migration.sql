ALTER TABLE "stores"
ADD COLUMN "loyaltyPointsEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "pointsPerDeliveredOrder" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "users"
ADD COLUMN "loyaltyPoints" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "loyalty_point_transactions" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "loyalty_point_transactions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "loyalty_point_transactions_orderId_key"
ON "loyalty_point_transactions"("orderId");
CREATE INDEX "loyalty_point_transactions_storeId_customerId_idx"
ON "loyalty_point_transactions"("storeId", "customerId");

ALTER TABLE "loyalty_point_transactions"
ADD CONSTRAINT "loyalty_point_transactions_storeId_fkey"
FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "loyalty_point_transactions"
ADD CONSTRAINT "loyalty_point_transactions_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "loyalty_point_transactions"
ADD CONSTRAINT "loyalty_point_transactions_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
