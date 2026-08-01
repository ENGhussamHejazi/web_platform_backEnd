-- DropIndex
DROP INDEX "shipping_zones_storeId_governorate_key";

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "cityId" TEXT,
ADD COLUMN     "cityNameSnapshot" TEXT,
ADD COLUMN     "estimatedDeliveryTimeSnapshot" TEXT,
ADD COLUMN     "shippingZoneId" TEXT;

-- AlterTable
ALTER TABLE "shipping_zones" ADD COLUMN     "cityId" TEXT,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "currencyCode" TEXT NOT NULL DEFAULT 'SYP',
ADD COLUMN     "estimatedDeliveryTime" TEXT,
ADD COLUMN     "freeDeliveryMinimum" DECIMAL(10,2),
ADD COLUMN     "isDeliveryAvailable" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "minimumOrderAmount" DECIMAL(10,2),
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "cities" (
    "id" TEXT NOT NULL,
    "governorate" "Governorate" NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT,
    "slug" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "postalCode" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_addresses" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "governorate" "Governorate" NOT NULL,
    "cityId" TEXT,
    "cityNameSnapshot" TEXT,
    "detailedAddress" TEXT NOT NULL,
    "building" TEXT,
    "floor" TEXT,
    "apartment" TEXT,
    "landmark" TEXT,
    "phone" TEXT NOT NULL,
    "notes" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cities_governorate_idx" ON "cities"("governorate");

-- CreateIndex
CREATE INDEX "cities_governorate_isActive_idx" ON "cities"("governorate", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "cities_governorate_slug_key" ON "cities"("governorate", "slug");

-- CreateIndex
CREATE INDEX "customer_addresses_customerId_idx" ON "customer_addresses"("customerId");

-- CreateIndex
CREATE INDEX "shipping_zones_storeId_cityId_idx" ON "shipping_zones"("storeId", "cityId");

-- CreateIndex
CREATE UNIQUE INDEX "shipping_zones_storeId_governorate_cityId_key" ON "shipping_zones"("storeId", "governorate", "cityId");

-- AddForeignKey
ALTER TABLE "shipping_zones" ADD CONSTRAINT "shipping_zones_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "cities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "cities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "cities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

