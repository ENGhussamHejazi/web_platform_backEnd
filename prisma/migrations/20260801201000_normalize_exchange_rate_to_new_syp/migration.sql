-- Rates entered by the first version of the feature used old SYP. The new
-- currency removes two zeros, so normalize only values that are clearly in
-- the legacy scale. Typical new-SYP USD rates are in the low hundreds.
UPDATE "stores"
SET "usdToSypRate" = "usdToSypRate" / 100
WHERE "usdToSypRate" >= 1000;
