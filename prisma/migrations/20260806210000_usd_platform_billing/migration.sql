-- Platform billing moves to USD.
--
-- Scope is deliberately limited to what a merchant pays TRENDWA: plan prices,
-- subscriptions and platform invoices. `stores.currency` and
-- `shipping_zones.currencyCode` are what a *shopper* pays a merchant and stay
-- merchant-controlled — do not fold them into this.

-- 1. Defaults for new rows.
ALTER TABLE "subscriptions" ALTER COLUMN "currency" SET DEFAULT 'USD';
ALTER TABLE "subscription_invoices" ALTER COLUMN "currency" SET DEFAULT 'USD';

-- 2. Repriced plan ladder, derived from what each tier actually unlocks in
--    code (catalog capacity, images per product, the theme gates in
--    store-theme.service.ts, the report gates in merchant-reports.controller.ts,
--    CUSTOMER_CHAT and CUSTOMER_EMAILS). Mirrored in prisma/seed.ts, which is
--    what fresh environments use.
UPDATE "plans" SET
  "description"         = 'لإطلاق متجرك الأول والبيع من اليوم الأول',
  "priceMonthly"        = 12,
  "priceYearly"         = 120,
  "maxProducts"         = 50,
  "maxImagesPerProduct" = 3,
  "features" = ARRAY[
    'حتى 50 منتج، و3 صور لكل منتج',
    'متجر إلكتروني كامل مع الدفع عند الاستلام',
    'إدارة الطلبات والشحن حسب المحافظة',
    'حسابات عملاء وتقييمات ومراجعات',
    'قالب أساسي مع إمكانية تغيير ألوان المتجر',
    'تقارير المبيعات وأداء المنتجات',
    'دعم عبر البريد الإلكتروني'
  ]::text[],
  "featureKeys" = ARRAY['BASIC_TEMPLATES', 'CUSTOM_COLORS']::text[],
  "updatedAt" = NOW()
WHERE "key" = 'basic';

UPDATE "plans" SET
  "description"         = 'للمتاجر النامية التي تحتاج تصميماً أوسع وتحليلات وتواصلاً مباشراً مع العملاء',
  "priceMonthly"        = 30,
  "priceYearly"         = 300,
  "maxProducts"         = 500,
  "maxImagesPerProduct" = 6,
  "features" = ARRAY[
    'كل ميزات الباقة الأساسية',
    'حتى 500 منتج، و6 صور لكل منتج',
    'قوالب متقدمة (عصري وكلاسيكي)',
    'تخصيص الخطوط والأزرار وبطاقات المنتج والهيدر',
    'حفظ مسودات التصميم قبل نشرها',
    'دردشة مباشرة مع عملاء متجرك',
    'رسائل بريد للعملاء بهوية متجرك',
    'تحليلات المخزون وسجل حركة المخزون',
    'دعم ذو أولوية'
  ]::text[],
  "featureKeys" = ARRAY[
    'BASIC_TEMPLATES', 'ADVANCED_TEMPLATES', 'THEME_DRAFTS', 'CUSTOM_COLORS',
    'CUSTOM_TYPOGRAPHY', 'CUSTOM_BUTTONS', 'CUSTOM_PRODUCT_CARDS', 'CUSTOM_HEADER',
    'REPORTS_INVENTORY_ANALYTICS', 'REPORTS_STOCK_MOVEMENTS',
    'CUSTOMER_CHAT', 'CUSTOMER_EMAILS'
  ]::text[],
  "updatedAt" = NOW()
WHERE "key" = 'pro';

UPDATE "plans" SET
  "description"         = 'للمتاجر الكبيرة: بلا حدود على الكتالوج، تخصيص كامل، وسجل مالي شامل',
  "priceMonthly"        = 42,
  "priceYearly"         = 420,
  "maxProducts"         = NULL,
  "maxImagesPerProduct" = 8,
  "features" = ARRAY[
    'كل ميزات الباقة الاحترافية',
    'منتجات غير محدودة، و8 صور لكل منتج',
    'تخصيص كامل للتصميم: الفوتر والتخطيط والسلايدر',
    'فتح كل خيارات تخصيص المظهر دفعة واحدة',
    'سجل المعاملات المالية الكامل',
    'مدير حساب مخصص'
  ]::text[],
  "featureKeys" = ARRAY[
    'BASIC_TEMPLATES', 'ADVANCED_TEMPLATES', 'THEME_DRAFTS', 'CUSTOM_COLORS',
    'CUSTOM_TYPOGRAPHY', 'CUSTOM_BUTTONS', 'CUSTOM_PRODUCT_CARDS', 'CUSTOM_HEADER',
    'CUSTOM_FOOTER', 'CUSTOM_LAYOUT', 'CUSTOM_SLIDER', 'ADVANCED_THEME_CUSTOMIZATION',
    'REPORTS_INVENTORY_ANALYTICS', 'REPORTS_STOCK_MOVEMENTS', 'REPORTS_TRANSACTIONS',
    'CUSTOMER_CHAT', 'CUSTOMER_EMAILS'
  ]::text[],
  "updatedAt" = NOW()
WHERE "key" = 'business';

-- 3. Existing subscriptions carry the OLD lira amounts. Flipping the currency
--    label alone would relabel 250000 SYP as $250,000, so reprice from the
--    plan the same way the app does (admin.service.ts#updatePlan:
--    basePrice = plan price for the store's billing cycle, finalAmount = basePrice).
UPDATE "subscriptions" s SET
  "basePrice" = CASE WHEN st."billingCycle" = 'YEARLY' THEN p."priceYearly" ELSE p."priceMonthly" END,
  "finalAmount" = CASE WHEN st."billingCycle" = 'YEARLY' THEN p."priceYearly" ELSE p."priceMonthly" END,
  "discount" = 0,
  "tax" = 0,
  "currency" = 'USD',
  "updatedAt" = NOW()
FROM "stores" st, "plans" p
WHERE s."storeId" = st."id" AND s."planId" = p."id";

-- Subscriptions with no plan attached have no price to derive; only the label changes.
UPDATE "subscriptions" SET "currency" = 'USD' WHERE "planId" IS NULL;

-- 4. Same for platform invoices and recorded payments, which mirror the
--    subscription's contracted amount.
UPDATE "subscription_invoices" i SET
  "amount" = s."basePrice",
  "discount" = 0,
  "tax" = 0,
  "finalAmount" = s."finalAmount",
  "currency" = 'USD'
FROM "subscriptions" s
WHERE i."subscriptionId" = s."id";

UPDATE "subscription_payments" pay SET
  "amount" = s."finalAmount"
FROM "subscriptions" s
WHERE pay."subscriptionId" = s."id";
