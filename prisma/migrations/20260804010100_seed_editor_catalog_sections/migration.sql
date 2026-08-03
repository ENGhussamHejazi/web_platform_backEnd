INSERT INTO "homepage_sections" (
  "id", "storeId", "type", "title", "subtitle", "config", "sortOrder",
  "isVisible", "showOnMobile", "showOnDesktop", "createdAt", "updatedAt"
)
SELECT
  md5(random()::text || clock_timestamp()::text || s."id")::uuid::text,
  s."id",
  'ALL_PRODUCTS'::"HomepageSectionType",
  'كل المنتجات',
  'اكتشف أحدث المنتجات المتوفرة في المتجر',
  '{"limit":4}'::jsonb,
  COALESCE((SELECT MAX(h."sortOrder") + 1 FROM "homepage_sections" h WHERE h."storeId" = s."id"), 0),
  true, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "stores" s
WHERE NOT EXISTS (
  SELECT 1 FROM "homepage_sections" h
  WHERE h."storeId" = s."id" AND h."type" = 'ALL_PRODUCTS'::"HomepageSectionType"
);

INSERT INTO "homepage_sections" (
  "id", "storeId", "type", "config", "sortOrder",
  "isVisible", "showOnMobile", "showOnDesktop", "createdAt", "updatedAt"
)
SELECT
  md5(random()::text || clock_timestamp()::text || s."id")::uuid::text,
  s."id",
  'ALL_CATEGORY_PRODUCTS'::"HomepageSectionType",
  '{"limit":4}'::jsonb,
  COALESCE((SELECT MAX(h."sortOrder") + 1 FROM "homepage_sections" h WHERE h."storeId" = s."id"), 0),
  true, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "stores" s
WHERE NOT EXISTS (
  SELECT 1 FROM "homepage_sections" h
  WHERE h."storeId" = s."id" AND h."type" = 'ALL_CATEGORY_PRODUCTS'::"HomepageSectionType"
);
