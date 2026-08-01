// Stable, plan-agnostic gate keys. Plans (backend/prisma/seed.ts) attach a
// set of these to `Plan.featureKeys` — never hardcode `plan.key === 'pro'`
// checks; always gate behind one of these instead so package boundaries can
// be redrawn later without touching enforcement code.
export const FEATURE_KEYS = [
  'BASIC_TEMPLATES',
  'ADVANCED_TEMPLATES',
  'CUSTOM_COLORS',
  'CUSTOM_TYPOGRAPHY',
  'CUSTOM_BUTTONS',
  'CUSTOM_PRODUCT_CARDS',
  'CUSTOM_HEADER',
  'CUSTOM_FOOTER',
  'CUSTOM_LAYOUT',
  'CUSTOM_SLIDER',
  'THEME_DRAFTS',
  'ADVANCED_THEME_CUSTOMIZATION',
  'REPORTS_INVENTORY_ANALYTICS',
  'REPORTS_STOCK_MOVEMENTS',
  'REPORTS_TRANSACTIONS',
  'CUSTOMER_CHAT',
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

export function isFeatureKey(value: string): value is FeatureKey {
  return (FEATURE_KEYS as readonly string[]).includes(value);
}
