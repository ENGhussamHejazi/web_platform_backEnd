/*
  Warnings:

  - You are about to drop the column `bannerUrl` on the `stores` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "stores" DROP COLUMN "bannerUrl";

-- CreateTable
CREATE TABLE "store_gallery_images" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "publicId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "store_gallery_images_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "store_gallery_images_storeId_idx" ON "store_gallery_images"("storeId");

-- AddForeignKey
ALTER TABLE "store_gallery_images" ADD CONSTRAINT "store_gallery_images_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
