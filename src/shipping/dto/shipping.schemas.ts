import { z } from 'zod';

export const GOVERNORATE_VALUES = [
  'DAMASCUS',
  'RIF_DIMASHQ',
  'ALEPPO',
  'HOMS',
  'HAMA',
  'LATAKIA',
  'TARTUS',
  'IDLIB',
  'DEIR_EZ_ZOR',
  'RAQQA',
  'HASAKAH',
  'DARAA',
  'SWEIDA',
  'QUNEITRA',
] as const;

export const setShippingZoneSchema = z.object({
  cost: z
    .number({ message: 'تكلفة الشحن يجب أن تكون رقماً' })
    .min(0, 'تكلفة الشحن لا يمكن أن تكون سالبة'),
});
export type SetShippingZoneDto = z.infer<typeof setShippingZoneSchema>;

export const cityRateSchema = z.object({
  isDeliveryAvailable: z.boolean().optional().default(true),
  cost: z
    .number({ message: 'تكلفة الشحن يجب أن تكون رقماً' })
    .min(0, 'تكلفة الشحن لا يمكن أن تكون سالبة'),
  estimatedDeliveryTime: z
    .string()
    .trim()
    .max(60, 'المدة الزمنية طويلة جداً')
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? v : undefined)),
  freeDeliveryMinimum: z
    .number()
    .min(0, 'حد التوصيل المجاني لا يمكن أن يكون سالباً')
    .optional()
    .nullable(),
  minimumOrderAmount: z
    .number()
    .min(0, 'الحد الأدنى للطلب لا يمكن أن يكون سالباً')
    .optional()
    .nullable(),
  notes: z
    .string()
    .trim()
    .max(500, 'الملاحظات طويلة جداً')
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? v : undefined)),
});
export type CityRateDto = z.infer<typeof cityRateSchema>;

export const bulkCityRateSchema = z
  .object({
    cityIds: z
      .array(z.string().uuid('معرّف مدينة غير صالح'))
      .min(1, 'اختر مدينة واحدة على الأقل'),
    isDeliveryAvailable: z.boolean().optional(),
    cost: z.number().min(0, 'تكلفة الشحن لا يمكن أن تكون سالبة').optional(),
    estimatedDeliveryTime: z.string().trim().max(60).optional(),
    freeDeliveryMinimum: z.number().min(0).optional().nullable(),
    minimumOrderAmount: z.number().min(0).optional().nullable(),
    notes: z.string().trim().max(500).optional(),
  })
  .refine(
    (data) => data.isDeliveryAvailable !== undefined || data.cost !== undefined,
    { message: 'حدد الحالة أو السعر على الأقل', path: ['cost'] },
  );
export type BulkCityRateDto = z.infer<typeof bulkCityRateSchema>;

export const copyCityRatesSchema = z.object({
  sourceCityId: z.string().uuid('معرّف المدينة المصدر غير صالح'),
  targetCityIds: z
    .array(z.string().uuid('معرّف مدينة غير صالح'))
    .min(1, 'اختر مدينة واحدة على الأقل'),
});
export type CopyCityRatesDto = z.infer<typeof copyCityRatesSchema>;
