-- Add marketplace-directory fields to Store: merchant-set governorate and
-- admin-only verified trust badge. Both nullable/defaulted, safe on existing rows.
ALTER TABLE "stores" ADD COLUMN "governorate" "Governorate";
ALTER TABLE "stores" ADD COLUMN "verified" BOOLEAN NOT NULL DEFAULT false;
