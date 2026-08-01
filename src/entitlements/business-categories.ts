// Store-level business/activity classification, chosen at registration and
// editable later from merchant store settings. Kept as a plain string union
// (not a Prisma enum) so new categories can be added without a migration —
// same convention as FEATURE_KEYS in this directory.
export const STORE_BUSINESS_CATEGORIES = [
  'GROCERY_SUPERMARKET',
  'FRUITS_VEGETABLES',
  'BUTCHER_MEAT',
  'BAKERY_SWEETS',
  'RESTAURANT_FOOD',
  'FASHION_CLOTHING',
  'ELECTRONICS',
  'HOME_GOODS',
  'BEAUTY_COSMETICS',
  'OTHER',
] as const;

export type StoreBusinessCategory = (typeof STORE_BUSINESS_CATEGORIES)[number];

export function isStoreBusinessCategory(value: string): value is StoreBusinessCategory {
  return (STORE_BUSINESS_CATEGORIES as readonly string[]).includes(value);
}

// Categories whose merchants are allowed to sell products by weight
// (e.g. produce/meat/bakery sold per kg/gram with a minimum order quantity).
export const WEIGHT_SELLING_CATEGORIES: StoreBusinessCategory[] = [
  'GROCERY_SUPERMARKET',
  'FRUITS_VEGETABLES',
  'BUTCHER_MEAT',
  'BAKERY_SWEETS',
];

export function storeSupportsWeightSelling(
  categories?: readonly string[] | null,
): boolean {
  return (
    !!categories &&
    categories.some((c) => WEIGHT_SELLING_CATEGORIES.includes(c as StoreBusinessCategory))
  );
}
