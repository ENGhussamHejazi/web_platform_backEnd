import { z } from 'zod';

export const listProductsQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  categoryId: z.string().uuid().optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});
export type ListProductsQueryDto = z.infer<typeof listProductsQuerySchema>;

const productImageSchema = z.object({
  url: z.string().trim().min(1, 'رابط الصورة مطلوب'),
  publicId: z.string().trim().optional().nullable(),
});

export const productVariantSchema = z
  .object({
    id: z.string().uuid().optional(),
    size: z.string().trim().max(30).optional().nullable(),
    color: z.string().trim().max(60).optional().nullable(),
    colorHex: z
      .string()
      .trim()
      .regex(/^#[0-9a-fA-F]{6}$/, 'صيغة اللون يجب أن تكون مثل ‎#FF0000‎')
      .optional()
      .nullable(),
    sku: z.string().trim().max(60).optional().nullable(),
    price: z
      .number({ message: 'السعر يجب أن يكون رقماً' })
      .positive('السعر يجب أن يكون أكبر من صفر')
      .optional()
      .nullable(),
    compareAtPrice: z
      .number({ message: 'السعر قبل الخصم يجب أن يكون رقماً' })
      .positive('السعر قبل الخصم يجب أن يكون أكبر من صفر')
      .optional()
      .nullable(),
    stock: z
      .number({ message: 'الكمية يجب أن تكون رقماً' })
      .int('الكمية يجب أن تكون عدداً صحيحاً')
      .min(0, 'الكمية لا يمكن أن تكون سالبة'),
    isActive: z.boolean().optional().default(true),
    sortOrder: z.number().int().optional().default(0),
  })
  .refine((v) => Boolean(v.size) || Boolean(v.color), {
    message: 'يجب تحديد المقاس أو اللون على الأقل لكل متغير',
  });
export type ProductVariantDto = z.infer<typeof productVariantSchema>;

function hasDuplicateVariantCombos(variants: ProductVariantDto[]) {
  const seen = new Set<string>();
  for (const v of variants) {
    const key = `${v.size ?? ''}::${v.color ?? ''}`;
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}

const boxPresetItemSchema = z.object({
  itemProductId: z.string().uuid(),
  quantity: z.number().int().min(1, 'الكمية يجب أن تكون 1 على الأقل').default(1),
  sortOrder: z.number().int().optional().default(0),
});

const boxPresetSchema = z.object({
  id: z.string().uuid().optional(),
  name: z
    .string({ message: 'اسم الصندوق الجاهز مطلوب' })
    .trim()
    .min(2, 'اسم الصندوق الجاهز قصير جداً')
    .max(120),
  imageUrl: z.string().trim().max(1000).optional().nullable(),
  sortOrder: z.number().int().optional().default(0),
  isActive: z.boolean().optional().default(true),
  items: z
    .array(boxPresetItemSchema)
    .min(1, 'يجب إضافة عنصر واحد على الأقل للصندوق الجاهز')
    .max(50),
});
export type BoxPresetDto = z.infer<typeof boxPresetSchema>;

const boxFieldsSchema = z.object({
  isBox: z.boolean().optional(),
  boxMaxItems: z
    .number({ message: 'الحد الأقصى لعدد العناصر يجب أن يكون رقماً' })
    .int('الحد الأقصى لعدد العناصر يجب أن يكون عدداً صحيحاً')
    .min(1, 'يجب أن يسمح الصندوق بعنصر واحد على الأقل')
    .optional()
    .nullable(),
  boxItemIds: z.array(z.string().uuid()).max(200).optional(),
  boxPresets: z.array(boxPresetSchema).max(30).optional(),
});

function validateBoxFields(v: {
  isBox?: boolean;
  boxMaxItems?: number | null;
  boxItemIds?: string[];
}) {
  if (!v.isBox) return true;
  return Boolean(v.boxMaxItems) && Boolean(v.boxItemIds?.length);
}

// Sold-by-weight fields — only settable when the owning store's
// businessCategory is in WEIGHT_SELLING_CATEGORIES (checked in
// ProductsService, since that requires a store lookup this schema can't do).
const weightFieldsSchema = z.object({
  soldByWeight: z.boolean().optional(),
  weightUnit: z.enum(['KG', 'GRAM']).optional().nullable(),
  minOrderQuantity: z
    .number({ message: 'الحد الأدنى للطلب يجب أن يكون رقماً' })
    .positive('الحد الأدنى للطلب يجب أن يكون أكبر من صفر')
    .optional()
    .nullable(),
  stepQuantity: z
    .number({ message: 'خطوة الكمية يجب أن تكون رقماً' })
    .positive('خطوة الكمية يجب أن تكون أكبر من صفر')
    .optional()
    .nullable(),
});

function validateWeightFields(v: {
  soldByWeight?: boolean;
  weightUnit?: 'KG' | 'GRAM' | null;
  minOrderQuantity?: number | null;
  stepQuantity?: number | null;
}) {
  if (!v.soldByWeight) return true;
  return (
    Boolean(v.weightUnit) &&
    Boolean(v.minOrderQuantity) &&
    Boolean(v.stepQuantity) &&
    (v.minOrderQuantity as number) >= (v.stepQuantity as number)
  );
}

export const createProductSchema = z
  .object({
    name: z
      .string({ message: 'اسم المنتج مطلوب' })
      .trim()
      .min(2, 'اسم المنتج يجب أن يكون حرفين على الأقل')
      .max(160, 'اسم المنتج طويل جداً'),
    description: z.string().trim().max(4000).optional(),
    price: z
      .number({ message: 'السعر يجب أن يكون رقماً' })
      .positive('السعر يجب أن يكون أكبر من صفر'),
    compareAtPrice: z
      .number({ message: 'السعر قبل الخصم يجب أن يكون رقماً' })
      .positive('السعر قبل الخصم يجب أن يكون أكبر من صفر')
      .optional()
      .nullable(),
    // Fractional stock only valid when soldByWeight — enforced below.
    stock: z
      .number({ message: 'الكمية يجب أن تكون رقماً' })
      .min(0, 'الكمية لا يمكن أن تكون سالبة'),
    categoryId: z.string().uuid().optional().nullable(),
    isActive: z.boolean().optional().default(true),
    isFeatured: z.boolean().optional().default(false),
    isNewArrival: z.boolean().optional().default(false),
    images: z.array(productImageSchema).max(8, 'الحد الأقصى 8 صور').optional(),
    variants: z
      .array(productVariantSchema)
      .max(200, 'عدد كبير جداً من المتغيرات')
      .optional(),
    ...boxFieldsSchema.shape,
    ...weightFieldsSchema.shape,
  })
  .refine((v) => !v.variants || !hasDuplicateVariantCombos(v.variants), {
    message: 'يوجد مقاس/لون مكرر بين المتغيرات',
    path: ['variants'],
  })
  .refine(validateBoxFields, {
    message: 'يجب تحديد الحد الأقصى للعناصر واختيار عناصر مؤهلة واحدة على الأقل للصندوق',
    path: ['boxItemIds'],
  })
  .refine((v) => v.soldByWeight || Number.isInteger(v.stock), {
    message: 'الكمية يجب أن تكون عدداً صحيحاً للمنتجات غير المباعة بالوزن',
    path: ['stock'],
  })
  .refine(validateWeightFields, {
    message: 'يجب تحديد وحدة الوزن والحد الأدنى وخطوة الكمية (بحيث لا تقل الكمية الدنيا عن الخطوة)',
    path: ['minOrderQuantity'],
  });
export type CreateProductDto = z.infer<typeof createProductSchema>;

export const updateProductSchema = z
  .object({
    name: z
      .string({ message: 'اسم المنتج مطلوب' })
      .trim()
      .min(2, 'اسم المنتج يجب أن يكون حرفين على الأقل')
      .max(160, 'اسم المنتج طويل جداً')
      .optional(),
    description: z.string().trim().max(4000).optional(),
    price: z
      .number({ message: 'السعر يجب أن يكون رقماً' })
      .positive('السعر يجب أن يكون أكبر من صفر')
      .optional(),
    compareAtPrice: z
      .number({ message: 'السعر قبل الخصم يجب أن يكون رقماً' })
      .positive('السعر قبل الخصم يجب أن يكون أكبر من صفر')
      .optional()
      .nullable(),
    // Fractional stock only valid when soldByWeight — enforced below.
    stock: z
      .number({ message: 'الكمية يجب أن تكون رقماً' })
      .min(0, 'الكمية لا يمكن أن تكون سالبة')
      .optional(),
    categoryId: z.string().uuid().optional().nullable(),
    isActive: z.boolean().optional(),
    isFeatured: z.boolean().optional(),
    isNewArrival: z.boolean().optional(),
    images: z.array(productImageSchema).max(8, 'الحد الأقصى 8 صور').optional(),
    variants: z
      .array(productVariantSchema)
      .max(200, 'عدد كبير جداً من المتغيرات')
      .optional(),
    ...boxFieldsSchema.shape,
    ...weightFieldsSchema.shape,
  })
  .refine((v) => !v.variants || !hasDuplicateVariantCombos(v.variants), {
    message: 'يوجد مقاس/لون مكرر بين المتغيرات',
    path: ['variants'],
  })
  .refine(validateBoxFields, {
    message: 'يجب تحديد الحد الأقصى للعناصر واختيار عناصر مؤهلة واحدة على الأقل للصندوق',
    path: ['boxItemIds'],
  })
  .refine((v) => v.soldByWeight || v.stock === undefined || Number.isInteger(v.stock), {
    message: 'الكمية يجب أن تكون عدداً صحيحاً للمنتجات غير المباعة بالوزن',
    path: ['stock'],
  })
  .refine(validateWeightFields, {
    message: 'يجب تحديد وحدة الوزن والحد الأدنى وخطوة الكمية (بحيث لا تقل الكمية الدنيا عن الخطوة)',
    path: ['minOrderQuantity'],
  });
export type UpdateProductDto = z.infer<typeof updateProductSchema>;

export const createCategorySchema = z.object({
  name: z
    .string({ message: 'اسم التصنيف مطلوب' })
    .trim()
    .min(2, 'اسم التصنيف يجب أن يكون حرفين على الأقل')
    .max(80, 'اسم التصنيف طويل جداً'),
  imageUrl: z.string().trim().max(1000).optional().nullable(),
  slug: z
    .string()
    .trim()
    .min(1, 'رابط التصنيف مطلوب')
    .max(100)
    .regex(/^[a-z0-9\u0600-\u06ff]+(?:-[a-z0-9\u0600-\u06ff]+)*$/i, 'استخدم أحرفاً وأرقاماً وشرطات فقط')
    .optional(),
  icon: z.string().trim().max(80).optional().nullable(),
  sortOrder: z.number().int().optional().default(0),
  isActive: z.boolean().optional().default(true),
  isVisible: z.boolean().optional().default(true),
  parentCategoryId: z.string().uuid().optional().nullable(),
});
export type CreateCategoryDto = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = createCategorySchema.partial();
export type UpdateCategoryDto = z.infer<typeof updateCategorySchema>;

export const reorderCategoriesSchema = z.object({
  categoryIds: z.array(z.string().uuid()).min(1).max(200),
});
export type ReorderCategoriesDto = z.infer<typeof reorderCategoriesSchema>;
