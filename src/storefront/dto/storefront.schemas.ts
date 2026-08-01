import { z } from 'zod';
import { GOVERNORATE_VALUES } from '../../shipping/dto/shipping.schemas';

export const PRODUCT_SORT_VALUES = [
  'newest',
  'featured',
  'bestseller',
  'discounted',
] as const;

export const listPublicProductsQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  categoryId: z.string().uuid().optional(),
  sort: z.enum(PRODUCT_SORT_VALUES).optional(),
  limit: z.coerce.number().int().min(1).max(24).optional(),
});
export type ListPublicProductsQueryDto = z.infer<
  typeof listPublicProductsQuerySchema
>;

const boxChildItemSchema = z.object({
  productId: z.string().uuid({ message: 'معرّف المنتج غير صالح' }),
  quantity: z
    .number({ message: 'الكمية يجب أن تكون رقماً' })
    .int('الكمية يجب أن تكون عدداً صحيحاً')
    .positive('الكمية يجب أن تكون أكبر من صفر'),
});

const orderItemSchema = z.object({
  productId: z.string().uuid({ message: 'معرّف المنتج غير صالح' }),
  variantId: z.string().uuid({ message: 'معرّف المتغيّر غير صالح' }).optional(),
  // Fractional only valid for sold-by-weight products — the service layer
  // checks Number.isInteger() against product.soldByWeight since this schema
  // can't see the product record.
  quantity: z
    .number({ message: 'الكمية يجب أن تكون رقماً' })
    .positive('الكمية يجب أن تكون أكبر من صفر'),
  // Present only when productId refers to a box product — the customer's
  // chosen contents for that box, revalidated server-side same as any item.
  boxItems: z.array(boxChildItemSchema).max(50).optional(),
});

export const createGuestOrderSchema = z.object({
  items: z
    .array(orderItemSchema)
    .min(1, 'السلة فارغة')
    .max(50, 'عدد العناصر كبير جداً'),
  guestName: z
    .string({ message: 'الاسم مطلوب' })
    .trim()
    .min(2, 'الاسم يجب أن يكون حرفين على الأقل')
    .max(120, 'الاسم طويل جداً'),
  guestPhone: z
    .string({ message: 'رقم الهاتف مطلوب' })
    .trim()
    .min(6, 'رقم الهاتف غير صالح')
    .max(30, 'رقم الهاتف غير صالح'),
  guestEmail: z
    .string()
    .trim()
    .email('البريد الإلكتروني غير صالح')
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? v : undefined)),
  fulfillmentType: z.enum(['DELIVERY', 'PICKUP']).optional(),
  shippingAddress: z
    .string({ message: 'العنوان مطلوب' })
    .trim()
    .min(5, 'العنوان يجب أن يكون 5 أحرف على الأقل')
    .max(500, 'العنوان طويل جداً')
    .optional(),
  governorate: z.enum(GOVERNORATE_VALUES, { message: 'المحافظة غير صالحة' }).optional(),
  // Optional for backward compatibility with stores/clients not yet using
  // city-level pricing — falls back to the legacy governorate-wide rate.
  cityId: z.string().uuid({ message: 'معرّف المدينة غير صالح' }).optional(),
  building: z.string().trim().max(100).optional(),
  floor: z.string().trim().max(50).optional(),
  apartment: z.string().trim().max(50).optional(),
  landmark: z.string().trim().max(200).optional(),
  addressNotes: z.string().trim().max(500).optional(),
  // Generated client-side once per checkout attempt so retries/double-clicks
  // resolve to the same order instead of creating duplicates.
  clientRequestId: z.string().trim().min(1).max(100).optional(),
  redeemLoyaltyReward: z.boolean().optional().default(false),
  // Cloudflare Turnstile token; verified by CaptchaGuard, not here — the
  // schema just needs to let it through the body without stripping it.
  captchaToken: z.string().trim().optional(),
}).superRefine((data, ctx) => {
  if ((data.fulfillmentType ?? 'DELIVERY') === 'DELIVERY' && !data.shippingAddress) {
    ctx.addIssue({ code: 'custom', path: ['shippingAddress'], message: 'العنوان مطلوب' });
  }
  if ((data.fulfillmentType ?? 'DELIVERY') === 'DELIVERY' && !data.governorate) {
    ctx.addIssue({ code: 'custom', path: ['governorate'], message: 'المحافظة مطلوبة' });
  }
});
export type CreateGuestOrderDto = z.infer<typeof createGuestOrderSchema>;

export const createReviewSchema = z.object({
  rating: z
    .number({ message: 'التقييم مطلوب' })
    .int('التقييم يجب أن يكون عدداً صحيحاً')
    .min(1, 'التقييم يجب أن يكون بين 1 و 5')
    .max(5, 'التقييم يجب أن يكون بين 1 و 5'),
  comment: z
    .string()
    .trim()
    .max(1000, 'التعليق طويل جداً')
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? v : undefined)),
});
export type CreateReviewDto = z.infer<typeof createReviewSchema>;

export const listReviewsQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});
export type ListReviewsQueryDto = z.infer<typeof listReviewsQuerySchema>;
