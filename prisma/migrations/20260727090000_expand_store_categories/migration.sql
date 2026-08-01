ALTER TABLE "categories"
ADD COLUMN "slug" TEXT,
ADD COLUMN "icon" TEXT,
ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "isVisible" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "parentCategoryId" TEXT,
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "categories"
SET "slug" = LOWER(REGEXP_REPLACE(TRIM("name"), '\s+', '-', 'g')) || '-' || LEFT("id", 8);

ALTER TABLE "categories" ALTER COLUMN "slug" SET NOT NULL;

CREATE UNIQUE INDEX "categories_storeId_slug_key" ON "categories"("storeId", "slug");
CREATE INDEX "categories_storeId_isActive_isVisible_sortOrder_idx"
ON "categories"("storeId", "isActive", "isVisible", "sortOrder");
CREATE INDEX "categories_parentCategoryId_idx" ON "categories"("parentCategoryId");

ALTER TABLE "categories"
ADD CONSTRAINT "categories_parentCategoryId_fkey"
FOREIGN KEY ("parentCategoryId") REFERENCES "categories"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
