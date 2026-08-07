-- Syrian pound redenomination: two zeros removed (100 old SYP = 1 new SYP).
-- Divides all SYP-denominated monetary columns by 100. USD-denominated
-- platform billing tables (plans, subscriptions, subscription_payments,
-- subscription_invoices) are intentionally excluded.

UPDATE "products" SET "price" = "price" / 100, "compareAtPrice" = "compareAtPrice" / 100;

UPDATE "product_variants" SET "price" = "price" / 100, "compareAtPrice" = "compareAtPrice" / 100;

UPDATE "orders" SET
  "subtotal" = "subtotal" / 100,
  "shippingCost" = "shippingCost" / 100,
  "total" = "total" / 100,
  "loyaltyDiscount" = "loyaltyDiscount" / 100,
  "paidAmount" = "paidAmount" / 100,
  "usdToSypRateSnapshot" = "usdToSypRateSnapshot" / 100;

UPDATE "order_items" SET "price" = "price" / 100;

UPDATE "shipping_zones" SET
  "cost" = "cost" / 100,
  "freeDeliveryMinimum" = "freeDeliveryMinimum" / 100,
  "minimumOrderAmount" = "minimumOrderAmount" / 100;

UPDATE "refunds" SET "amount" = "amount" / 100;

UPDATE "stores" SET "usdToSypRate" = "usdToSypRate" / 100;
