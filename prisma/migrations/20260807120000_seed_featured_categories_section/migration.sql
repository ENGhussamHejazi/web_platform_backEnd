INSERT INTO "homepage_sections" (
  "id", "storeId", "type", "title", "subtitle", "config", "sortOrder",
  "isVisible", "showOnMobile", "showOnDesktop", "createdAt", "updatedAt"
)
SELECT
  md5(random()::text || clock_timestamp()::text || s."id")::uuid::text,
  s."id",
  'FEATURED_CATEGORIES'::"HomepageSectionType",
  'تسوق حسب الفئة',
  NULL,
  '{"limit":6}'::jsonb,
  COALESCE((SELECT MAX(h."sortOrder") + 1 FROM "homepage_sections" h WHERE h."storeId" = s."id"), 0),
  true, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "stores" s
WHERE NOT EXISTS (
  SELECT 1 FROM "homepage_sections" h
  WHERE h."storeId" = s."id" AND h."type" = 'FEATURED_CATEGORIES'::"HomepageSectionType"
);
