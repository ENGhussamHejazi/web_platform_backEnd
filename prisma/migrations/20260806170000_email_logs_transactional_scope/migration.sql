-- AlterTable
ALTER TABLE "email_logs" ADD COLUMN     "orderId" TEXT,
ADD COLUMN     "storeId" TEXT,
ALTER COLUMN "recipientUserId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "email_logs_storeId_idx" ON "email_logs"("storeId");

-- CreateIndex
CREATE INDEX "email_logs_orderId_idx" ON "email_logs"("orderId");

-- CreateIndex
CREATE INDEX "email_logs_type_idx" ON "email_logs"("type");
