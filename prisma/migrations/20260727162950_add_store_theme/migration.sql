-- CreateEnum
CREATE TYPE "StoreThemeTemplate" AS ENUM ('MINIMAL', 'MODERN', 'CLASSIC');

-- AlterTable
ALTER TABLE "categories" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "plans" ADD COLUMN     "featureKeys" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "store_themes" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "templateId" "StoreThemeTemplate" NOT NULL DEFAULT 'MINIMAL',
    "templateVersion" INTEGER NOT NULL DEFAULT 1,
    "draftConfig" JSONB NOT NULL,
    "publishedConfig" JSONB,
    "publishedTemplateId" "StoreThemeTemplate",
    "publishedTemplateVersion" INTEGER,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "store_themes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "store_themes_storeId_key" ON "store_themes"("storeId");

-- AddForeignKey
ALTER TABLE "store_themes" ADD CONSTRAINT "store_themes_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
