import { z } from 'zod';
import { GOVERNORATE_VALUES } from '../../shipping/dto/shipping.schemas';

export { GOVERNORATE_VALUES };

const optionalTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? v : undefined));

export const createCitySchema = z.object({
  governorate: z.enum(GOVERNORATE_VALUES, { message: 'محافظة غير صالحة' }),
  nameAr: z
    .string({ message: 'الاسم بالعربي مطلوب' })
    .trim()
    .min(2, 'الاسم بالعربي يجب أن يكون حرفين على الأقل')
    .max(120, 'الاسم طويل جداً'),
  nameEn: optionalTrimmed(120),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(140)
    .regex(/^[a-z0-9-]+$/, 'المعرف يجب أن يحتوي أحرفاً لاتينية صغيرة وأرقاماً وشرطات فقط')
    .optional(),
  isActive: z.boolean().optional().default(true),
  displayOrder: z.number().int().optional().default(0),
  postalCode: optionalTrimmed(20),
  notes: optionalTrimmed(500),
});
export type CreateCityDto = z.infer<typeof createCitySchema>;

export const updateCitySchema = createCitySchema.partial();
export type UpdateCityDto = z.infer<typeof updateCitySchema>;

export const bulkCreateCitiesSchema = z.object({
  governorate: z.enum(GOVERNORATE_VALUES, { message: 'محافظة غير صالحة' }),
  cities: z
    .array(
      z.object({
        nameAr: z.string().trim().min(2, 'الاسم بالعربي مطلوب').max(120),
        nameEn: optionalTrimmed(120),
      }),
    )
    .min(1, 'أضف مدينة واحدة على الأقل')
    .max(200, 'عدد كبير جداً من المدن في طلب واحد'),
});
export type BulkCreateCitiesDto = z.infer<typeof bulkCreateCitiesSchema>;

export const reorderCitiesSchema = z.object({
  governorate: z.enum(GOVERNORATE_VALUES, { message: 'محافظة غير صالحة' }),
  cityIds: z.array(z.string().uuid('معرّف مدينة غير صالح')).min(1),
});
export type ReorderCitiesDto = z.infer<typeof reorderCitiesSchema>;

export const listCitiesQuerySchema = z.object({
  governorate: z.enum(GOVERNORATE_VALUES).optional(),
  search: z.string().trim().max(120).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
});
export type ListCitiesQueryDto = z.infer<typeof listCitiesQuerySchema>;
