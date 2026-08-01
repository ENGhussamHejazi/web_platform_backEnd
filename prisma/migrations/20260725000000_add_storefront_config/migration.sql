-- AlterEnum
ALTER TYPE "StoreStatus" ADD VALUE 'MAINTENANCE';

-- CreateEnum
CREATE TYPE "AnnouncementType" AS ENUM ('PROMO', 'FREE_SHIPPING', 'DISCOUNT');

-- AlterTable
ALTER TABLE "stores"
  ADD COLUMN "socialLinks" JSONB,
  ADD COLUMN "contactPhone" TEXT,
  ADD COLUMN "contactWhatsapp" TEXT,
  ADD COLUMN "publicEmail" TEXT,
  ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'SYP',
  ADD COLUMN "returnPolicy" TEXT,
  ADD COLUMN "shippingPolicy" TEXT,
  ADD COLUMN "codAvailable" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "bankTransferAvailable" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "legalLinks" JSONB,
  ADD COLUMN "openingAt" TIMESTAMP(3),
  ADD COLUMN "maintenanceMessage" TEXT;

-- CreateTable
CREATE TABLE "announcements" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "link" TEXT,
    "type" "AnnouncementType" NOT NULL DEFAULT 'PROMO',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "showOnMobile" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "newsletter_subscribers" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "newsletter_subscribers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "announcements_storeId_idx" ON "announcements"("storeId");

-- CreateIndex
CREATE INDEX "newsletter_subscribers_storeId_idx" ON "newsletter_subscribers"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "newsletter_subscribers_storeId_email_key" ON "newsletter_subscribers"("storeId", "email");

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "newsletter_subscribers" ADD CONSTRAINT "newsletter_subscribers_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
