ALTER TABLE "users"
ADD COLUMN "passwordResetTokenHash" TEXT,
ADD COLUMN "passwordResetExpiresAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "users_passwordResetTokenHash_key"
ON "users"("passwordResetTokenHash");

CREATE INDEX "users_passwordResetExpiresAt_idx"
ON "users"("passwordResetExpiresAt");
