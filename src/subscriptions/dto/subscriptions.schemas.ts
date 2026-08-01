import { z } from 'zod';

const SUBSCRIPTION_STATUSES = [
  'TRIAL',
  'ACTIVE',
  'SUSPENDED',
  'CANCELLED',
  'PENDING_PAYMENT',
] as const;
// Query-only filter values — EXPIRED is derived at read time (see
// subscriptions.service.ts#computeEffectiveStatus), never stored on the row.
const FILTERABLE_STATUSES = [...SUBSCRIPTION_STATUSES, 'EXPIRED'] as const;
const PAYMENT_STATUSES = [
  'PAID',
  'UNPAID',
  'PENDING_PAYMENT',
  'FAILED',
  'REFUNDED',
] as const;
const RENEWAL_TYPES = ['AUTO', 'MANUAL', 'DISABLED'] as const;
const BILLING_CYCLES = ['MONTHLY', 'YEARLY'] as const;

const dateStringSchema = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)), 'تاريخ غير صالح');

export const listSubscriptionsQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  planId: z.string().uuid().optional(),
  status: z.enum(FILTERABLE_STATUSES).optional(),
  billingCycle: z.enum(BILLING_CYCLES).optional(),
  paymentStatus: z.enum(PAYMENT_STATUSES).optional(),
  renewalType: z.enum(RENEWAL_TYPES).optional(),
  startDateFrom: dateStringSchema.optional(),
  startDateTo: dateStringSchema.optional(),
  expirationDateFrom: dateStringSchema.optional(),
  expirationDateTo: dateStringSchema.optional(),
  expiringWithinDays: z.coerce.number().int().positive().optional(),
  priceMin: z.coerce.number().nonnegative().optional(),
  priceMax: z.coerce.number().nonnegative().optional(),
  sortBy: z
    .enum([
      'createdAt',
      'startAt',
      'endAt',
      'price',
      'status',
      'store',
      'daysLeft',
    ])
    .default('createdAt'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(25),
});
export type ListSubscriptionsQueryDto = z.infer<
  typeof listSubscriptionsQuerySchema
>;

export const subscriptionsAnalyticsQuerySchema = listSubscriptionsQuerySchema
  .omit({ sortBy: true, sortDir: true, page: true, pageSize: true })
  .extend({
    periodDays: z.coerce.number().int().positive().max(365).default(30),
  });
export type SubscriptionsAnalyticsQueryDto = z.infer<
  typeof subscriptionsAnalyticsQuerySchema
>;

export const extendSubscriptionSchema = z
  .object({
    newEndAt: dateStringSchema.optional(),
    extendByDays: z.number().int().positive().max(3650).optional(),
  })
  .refine((v) => v.newEndAt || v.extendByDays, {
    message: 'يجب تحديد تاريخ جديد أو عدد أيام للتمديد',
  });
export type ExtendSubscriptionDto = z.infer<typeof extendSubscriptionSchema>;

export const changePackageSchema = z.object({
  planId: z.string().uuid('معرّف الباقة غير صالح'),
  billingCycle: z.enum(BILLING_CYCLES).optional(),
  note: z.string().trim().max(500).optional(),
});
export type ChangePackageDto = z.infer<typeof changePackageSchema>;

export const suspendSubscriptionSchema = z.object({
  reason: z.string().trim().min(2).max(500),
});
export type SuspendSubscriptionDto = z.infer<typeof suspendSubscriptionSchema>;

export const cancelSubscriptionSchema = z.object({
  reason: z.string().trim().min(2).max(500),
});
export type CancelSubscriptionDto = z.infer<typeof cancelSubscriptionSchema>;

export const updatePaymentStatusSchema = z.object({
  status: z.enum(PAYMENT_STATUSES),
  amount: z.number().nonnegative().optional(),
  method: z.string().trim().max(60).optional(),
  reference: z.string().trim().max(120).optional(),
});
export type UpdatePaymentStatusDto = z.infer<typeof updatePaymentStatusSchema>;

export const addSubscriptionNoteSchema = z.object({
  content: z.string().trim().min(1).max(2000),
});
export type AddSubscriptionNoteDto = z.infer<typeof addSubscriptionNoteSchema>;

export const exportSubscriptionsQuerySchema = listSubscriptionsQuerySchema
  .omit({ page: true, pageSize: true })
  .extend({
    format: z.enum(['csv', 'excel', 'pdf']).default('csv'),
  });
export type ExportSubscriptionsQueryDto = z.infer<
  typeof exportSubscriptionsQuerySchema
>;
