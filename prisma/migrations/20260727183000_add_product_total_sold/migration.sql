ALTER TABLE "products"
ADD COLUMN "totalSold" INTEGER NOT NULL DEFAULT 0;

UPDATE "products" AS product
SET "totalSold" = COALESCE((
  SELECT SUM(item."quantity")::INTEGER
  FROM "order_items" AS item
  WHERE item."productId" = product."id"
), 0);

CREATE INDEX "products_storeId_isActive_totalSold_idx"
ON "products"("storeId", "isActive", "totalSold");
