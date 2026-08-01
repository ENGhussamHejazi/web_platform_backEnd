CREATE TYPE "FulfillmentType" AS ENUM ('DELIVERY', 'PICKUP');

ALTER TABLE "stores"
  ADD COLUMN "pickupEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "pickupAddress" TEXT;

ALTER TABLE "orders"
  ADD COLUMN "fulfillmentType" "FulfillmentType" NOT NULL DEFAULT 'DELIVERY';
