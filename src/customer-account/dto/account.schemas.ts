import { z } from 'zod';
import { ORDER_STATUS_VALUES } from '../../orders/dto/orders.schemas';
import { GOVERNORATE_VALUES } from '../../shipping/dto/shipping.schemas';

export const updateProfileSchema = z.object({
  name: z
    .string({ message: 'الاسم مطلوب' })
    .trim()
    .min(2, 'الاسم يجب أن يكون حرفين على الأقل')
    .max(120, 'الاسم طويل جداً')
    .optional(),
  phone: z
    .string()
    .trim()
    .min(6, 'رقم الهاتف غير صالح')
    .max(30, 'رقم الهاتف غير صالح')
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? v : undefined)),
  dateOfBirth: z
    .string()
    .trim()
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? v : undefined)),
  gender: z
    .enum(['MALE', 'FEMALE', 'UNSPECIFIED'])
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? v : undefined)),
  preferredLanguage: z.enum(['ar', 'en']).optional(),
});
export type UpdateProfileDto = z.infer<typeof updateProfileSchema>;

export const listMyOrdersQuerySchema = z.object({
  status: z.enum(ORDER_STATUS_VALUES).optional(),
  search: z.string().trim().max(120).optional(),
  dateFrom: z.string().trim().optional(),
  dateTo: z.string().trim().optional(),
  sort: z.enum(['newest', 'oldest']).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(50).optional(),
});
export type ListMyOrdersQueryDto = z.infer<typeof listMyOrdersQuerySchema>;

export const CANCELLATION_REASONS = [
  'ORDERED_BY_MISTAKE',
  'FOUND_BETTER_PRICE',
  'CHANGE_SHIPPING_ADDRESS',
  'CHANGE_PRODUCTS',
  'DELIVERY_TOO_LONG',
  'OTHER',
] as const;

export const cancelOrderSchema = z.object({
  reason: z.enum(CANCELLATION_REASONS, { message: 'سبب الإلغاء مطلوب' }),
  note: z
    .string()
    .trim()
    .max(500, 'الملاحظة طويلة جداً')
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? v : undefined)),
});
export type CancelOrderDto = z.infer<typeof cancelOrderSchema>;

export const requestReturnSchema = z.object({
  reason: z.string().trim().min(1, 'سبب الإرجاع مطلوب').max(500),
  customerDescription: z
    .string()
    .trim()
    .max(2000, 'التفاصيل طويلة جداً')
    .optional(),
  items: z
    .array(
      z.object({
        orderItemId: z.string().min(1),
        requestedQty: z.number().int().positive(),
      }),
    )
    .min(1, 'اختر منتجاً واحداً على الأقل'),
});
export type RequestReturnDto = z.infer<typeof requestReturnSchema>;

const optionalTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? v : undefined));

export const createAddressSchema = z.object({
  governorate: z.enum(GOVERNORATE_VALUES, { message: 'المحافظة غير صالحة' }),
  cityId: z.string().uuid({ message: 'معرّف المدينة غير صالح' }),
  detailedAddress: z
    .string({ message: 'العنوان مطلوب' })
    .trim()
    .min(5, 'العنوان يجب أن يكون 5 أحرف على الأقل')
    .max(500, 'العنوان طويل جداً'),
  building: optionalTrimmed(100),
  floor: optionalTrimmed(50),
  apartment: optionalTrimmed(50),
  landmark: optionalTrimmed(200),
  phone: z
    .string({ message: 'رقم الهاتف مطلوب' })
    .trim()
    .min(6, 'رقم الهاتف غير صالح')
    .max(30, 'رقم الهاتف غير صالح'),
  notes: optionalTrimmed(500),
  isDefault: z.boolean().optional().default(false),
});
export type CreateAddressDto = z.infer<typeof createAddressSchema>;

export const updateAddressSchema = createAddressSchema.partial();
export type UpdateAddressDto = z.infer<typeof updateAddressSchema>;
