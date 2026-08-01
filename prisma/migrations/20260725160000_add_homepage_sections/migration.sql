-- CreateEnum
CREATE TYPE "HomepageSectionType" AS ENUM ('HERO_SLIDER', 'FEATURED_CATEGORIES', 'FEATURED_PRODUCTS', 'NEW_ARRIVALS', 'BEST_SELLERS', 'DISCOUNTED_PRODUCTS', 'PRODUCTS_BY_CATEGORY', 'STORE_BENEFITS', 'WHATSAPP_CTA', 'NEWSLETTER');

-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "imageUrl" TEXT,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "isFeatured" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "homepage_sections" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "type" "HomepageSectionType" NOT NULL,
    "title" TEXT,
    "subtitle" TEXT,
    "description" TEXT,
    "config" JSONB,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "showOnMobile" BOOLEAN NOT NULL DEFAULT true,
    "showOnDesktop" BOOLEAN NOT NULL DEFAULT true,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "homepage_sections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "homepage_sections_storeId_idx" ON "homepage_sections"("storeId");

-- AddForeignKey
ALTER TABLE "homepage_sections" ADD CONSTRAINT "homepage_sections_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
