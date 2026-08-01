CREATE TYPE "LoyaltyPointTransactionType" AS ENUM ('EARNED', 'REDEEMED', 'RESTORED');

ALTER TABLE "stores"
ADD COLUMN "pointsRequiredForDiscount" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN "loyaltyDiscountPercentage" INTEGER NOT NULL DEFAULT 10;

ALTER TABLE "orders"
ADD COLUMN "loyaltyDiscount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN "pointsRedeemed" INTEGER NOT NULL DEFAULT 0;

DROP INDEX "loyalty_point_transactions_orderId_key";
ALTER TABLE "loyalty_point_transactions"
ADD COLUMN "type" "LoyaltyPointTransactionType";
UPDATE "loyalty_point_transactions" SET "type" = 'EARNED';
ALTER TABLE "loyalty_point_transactions" ALTER COLUMN "type" SET NOT NULL;
CREATE UNIQUE INDEX "loyalty_point_transactions_orderId_type_key"
ON "loyalty_point_transactions"("orderId", "type");
