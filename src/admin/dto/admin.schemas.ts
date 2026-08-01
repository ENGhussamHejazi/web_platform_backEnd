import { z } from 'zod';
import { FEATURE_KEYS } from '../../entitlements/feature-keys';

const featureKeysSchema = z.array(z.enum(FEATURE_KEYS)).max(FEATURE_KEYS.length);

export const listStoresQuerySchema = z.object({
  status: z.enum(['PENDING', 'ACTIVE', 'SUSPENDED', 'REJECTED']).optional(),
  search: z.string().trim().max(120).optional(),
});
export type ListStoresQueryDto = z.infer<typeof listStoresQuerySchema>;

export const updateStoreStatusSchema = z.object({
  status: z.enum(['PENDING', 'ACTIVE', 'SUSPENDED', 'REJECTED']),
  note: z.string().trim().max(500).optional(),
});
export type UpdateStoreStatusDto = z.infer<typeof updateStoreStatusSchema>;

export const updateStorePlanSchema = z.object({
  planId: z.string().uuid('معرّف الباقة غير صالح'),
  billingCycle: z.enum(['MONTHLY', 'YEARLY']).optional(),
});
export type UpdateStorePlanDto = z.infer<typeof updateStorePlanSchema>;

export const createPlanSchema = z.object({
  key: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(
      /^[a-z0-9-]+$/,
      'المعرّف يجب أن يحتوي أحرف لاتينية صغيرة وأرقام وشرطات فقط',
    ),
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(300).optional(),
  priceMonthly: z.number().nonnegative(),
  priceYearly: z.number().nonnegative(),
  maxProducts: z.number().int().positive().optional(),
  maxImagesPerProduct: z.number().int().min(1).max(8).optional(),
  features: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
  featureKeys: featureKeysSchema.default([]),
  isActive: z.boolean().default(true),
  order: z.number().int().default(0),
});
export type CreatePlanDto = z.infer<typeof createPlanSchema>;

export const updatePlanSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  description: z.string().trim().max(300).optional(),
  priceMonthly: z.number().nonnegative().optional(),
  priceYearly: z.number().nonnegative().optional(),
  maxProducts: z.number().int().positive().optional(),
  maxImagesPerProduct: z.number().int().min(1).max(8).optional(),
  features: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
  featureKeys: featureKeysSchema.optional(),
  isActive: z.boolean().optional(),
  order: z.number().int().optional(),
});
export type UpdatePlanDto = z.infer<typeof updatePlanSchema>;

export const listAdminCustomersQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  storeId: z.string().uuid().optional(),
});
export type ListAdminCustomersQueryDto = z.infer<
  typeof listAdminCustomersQuerySchema
>;
