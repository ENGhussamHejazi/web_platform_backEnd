import { z } from 'zod';
import { STORE_BUSINESS_CATEGORIES } from '../../entitlements/business-categories';
import { Governorate } from '../../../generated/prisma';

export const MARKETPLACE_SORT_VALUES = [
  'RATING',
  'NEWEST',
  'PRICE_ASC',
  'PRICE_DESC',
  'NAME',
] as const;
export type MarketplaceSort = (typeof MARKETPLACE_SORT_VALUES)[number];

// Comma-separated lists arrive as a single query-string value; split+dedupe
// here so the rest of the service only ever deals with string[].
const csv = (allowed?: readonly string[]) =>
  z
    .string()
    .transform((v) => Array.from(new Set(v.split(',').map((s) => s.trim()).filter(Boolean))))
    .refine((arr) => !allowed || arr.every((v) => (allowed as readonly string[]).includes(v)), {
      message: 'قيمة غير صالحة',
    })
    .optional();

export const listMarketplaceStoresQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  categories: csv(STORE_BUSINESS_CATEGORIES),
  governorate: z.nativeEnum(Governorate).optional(),
  minPrice: z.coerce.number().nonnegative().optional(),
  maxPrice: z.coerce.number().nonnegative().optional(),
  minRating: z.coerce.number().min(0).max(5).optional(),
  verifiedOnly: z.coerce.boolean().optional(),
  openNow: z.coerce.boolean().optional(),
  sort: z.enum(MARKETPLACE_SORT_VALUES).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(48).optional(),
});
export type ListMarketplaceStoresQueryDto = z.infer<
  typeof listMarketplaceStoresQuerySchema
>;
