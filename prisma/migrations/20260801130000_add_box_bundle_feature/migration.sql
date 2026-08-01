-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "parentOrderItemId" TEXT;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "boxMaxItems" INTEGER,
ADD COLUMN     "isBox" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "box_items" (
    "id" TEXT NOT NULL,
    "boxProductId" TEXT NOT NULL,
    "itemProductId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "box_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "box_presets" (
    "id" TEXT NOT NULL,
    "boxProductId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "imageUrl" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "box_presets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "box_preset_items" (
    "id" TEXT NOT NULL,
    "presetId" TEXT NOT NULL,
    "itemProductId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "box_preset_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "box_items_itemProductId_idx" ON "box_items"("itemProductId");

-- CreateIndex
CREATE UNIQUE INDEX "box_items_boxProductId_itemProductId_key" ON "box_items"("boxProductId", "itemProductId");

-- CreateIndex
CREATE INDEX "box_presets_boxProductId_idx" ON "box_presets"("boxProductId");

-- CreateIndex
CREATE INDEX "box_preset_items_presetId_idx" ON "box_preset_items"("presetId");

-- CreateIndex
CREATE INDEX "box_preset_items_itemProductId_idx" ON "box_preset_items"("itemProductId");

-- CreateIndex
CREATE INDEX "order_items_parentOrderItemId_idx" ON "order_items"("parentOrderItemId");

-- AddForeignKey
ALTER TABLE "box_items" ADD CONSTRAINT "box_items_boxProductId_fkey" FOREIGN KEY ("boxProductId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "box_items" ADD CONSTRAINT "box_items_itemProductId_fkey" FOREIGN KEY ("itemProductId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "box_presets" ADD CONSTRAINT "box_presets_boxProductId_fkey" FOREIGN KEY ("boxProductId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "box_preset_items" ADD CONSTRAINT "box_preset_items_presetId_fkey" FOREIGN KEY ("presetId") REFERENCES "box_presets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "box_preset_items" ADD CONSTRAINT "box_preset_items_itemProductId_fkey" FOREIGN KEY ("itemProductId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_parentOrderItemId_fkey" FOREIGN KEY ("parentOrderItemId") REFERENCES "order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

