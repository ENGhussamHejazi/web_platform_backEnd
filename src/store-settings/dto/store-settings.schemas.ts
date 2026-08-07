import { z } from 'zod';
import { STORE_BUSINESS_CATEGORIES } from '../../entitlements/business-categories';
import { Governorate } from '../../../generated/prisma';

const socialLinksSchema = z.object({
  instagram: z.string().url().optional().or(z.literal('')),
  tiktok: z.string().url().optional().or(z.literal('')),
  snapchat: z.string().url().optional().or(z.literal('')),
  facebook: z.string().url().optional().or(z.literal('')),
  whatsapp: z.string().optional().or(z.literal('')),
  telegram: z.string().url().optional().or(z.literal('')),
  website: z.string().url().optional().or(z.literal('')),
});

const legalLinksSchema = z.object({
  terms: z.string().url().optional().or(z.literal('')),
  privacy: z.string().url().optional().or(z.literal('')),
  refund: z.string().url().optional().or(z.literal('')),
});

const storeImageSchema = z.object({
  url: z.string().trim().min(1, 'رابط الصورة مطلوب'),
  publicId: z.string().trim().optional().nullable(),
});

export const updateStoreSettingsSchema = z.object({
  description: z.string().trim().max(2000).optional().nullable(),
  logoUrl: z.string().trim().max(1000).optional().nullable(),
  galleryImages: z
    .array(storeImageSchema)
    .max(8, 'الحد الأقصى 8 صور')
    .optional(),
  primaryColor: z
    .string()
    .trim()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'اللون يجب أن يكون بصيغة hex صحيحة')
    .optional(),
  businessCategories: z
    .array(z.enum(STORE_BUSINESS_CATEGORIES))
    .min(1, 'الرجاء اختيار تصنيف واحد على الأقل لنشاط المتجر')
    .optional(),
  socialLinks: socialLinksSchema.partial().optional().nullable(),
  legalLinks: legalLinksSchema.partial().optional().nullable(),
  contactPhone: z.string().trim().max(30).optional().nullable(),
  contactWhatsapp: z.string().trim().max(30).optional().nullable(),
  publicEmail: z
    .string()
    .trim()
    .email('البريد الإلكتروني غير صالح')
    .optional()
    .nullable(),
  currency: z.string().trim().min(2).max(10).optional(),
  usdToSypRate: z.number().positive('سعر الصرف يجب أن يكون أكبر من صفر').max(100000000).optional().nullable(),
  returnPolicy: z.string().trim().max(1000).optional().nullable(),
  returnsEnabled: z.boolean().optional(),
  shippingPolicy: z.string().trim().max(1000).optional().nullable(),
  pickupEnabled: z.boolean().optional(),
  pickupAddress: z.string().trim().max(500).optional().nullable(),
  codAvailable: z.boolean().optional(),
  bankTransferAvailable: z.boolean().optional(),
  loyaltyPointsEnabled: z.boolean().optional(),
  pointsPerDeliveredOrder: z.number().int().min(1).max(10000).optional(),
  pointsRequiredForDiscount: z.number().int().min(1).max(100000).optional(),
  loyaltyDiscountPercentage: z.number().int().min(1).max(90).optional(),
  maintenanceMessage: z.string().trim().max(500).optional().nullable(),
  openingAt: z.string().datetime().optional().nullable(),
  governorate: z.nativeEnum(Governorate).optional().nullable(),
});
export type UpdateStoreSettingsDto = z.infer<typeof updateStoreSettingsSchema>;

export const announcementSchema = z.object({
  message: z.string().trim().min(1, 'نص الإعلان مطلوب').max(300),
  link: z.string().trim().url().optional().or(z.literal('')),
  type: z.enum(['PROMO', 'FREE_SHIPPING', 'DISCOUNT']).default('PROMO'),
  startDate: z.string().datetime().optional().nullable(),
  endDate: z.string().datetime().optional().nullable(),
  isVisible: z.boolean().default(true),
  showOnMobile: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});
export type AnnouncementDto = z.infer<typeof announcementSchema>;

export const updateAnnouncementSchema = announcementSchema.partial();
export type UpdateAnnouncementDto = z.infer<typeof updateAnnouncementSchema>;

export const HOMEPAGE_SECTION_TYPES = [
  'HERO_SLIDER',
  'FEATURED_CATEGORIES',
  'FEATURED_PRODUCTS',
  'NEW_ARRIVALS',
  'BEST_SELLERS',
  'DISCOUNTED_PRODUCTS',
  'PRODUCTS_BY_CATEGORY',
  'ALL_PRODUCTS',
  'ALL_CATEGORY_PRODUCTS',
  'STORE_BENEFITS',
  'WHATSAPP_CTA',
] as const;

const heroSlideSchema = z.object({
  imageUrl: z.string().trim().min(1, 'رابط الصورة مطلوب'),
  mobileImageUrl: z.string().trim().optional().or(z.literal('')),
  linkUrl: z.string().trim().optional().or(z.literal('')),
  linkLabel: z.string().trim().max(60).optional().or(z.literal('')),
});

const storeBenefitItemSchema = z.object({
  icon: z.string().trim().max(60),
  title: z.string().trim().min(1, 'العنوان مطلوب').max(80),
  description: z.string().trim().max(200).optional().or(z.literal('')),
});

const homepageSectionConfigSchema = z.object({
  slides: z.array(heroSlideSchema).max(10).optional(),
  items: z.array(storeBenefitItemSchema).max(12).optional(),
  categoryId: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(24).optional(),
  message: z.string().trim().max(300).optional(),
  productSort: z.enum(['all', 'newest', 'featured', 'bestseller', 'discounted']).optional(),
  showViewAll: z.boolean().optional(),
  viewAllLabel: z.string().trim().max(60).optional(),
  categoryIds: z.array(z.string().uuid()).max(50).optional(),
  mobileColumns: z.union([z.literal(1), z.literal(2)]).optional(),
  desktopColumns: z.union([z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6)]).optional(),
});

export const homepageSectionSchema = z
  .object({
    type: z.enum(HOMEPAGE_SECTION_TYPES),
    title: z.string().trim().max(120).optional().or(z.literal('')),
    subtitle: z.string().trim().max(200).optional().or(z.literal('')),
    description: z.string().trim().max(500).optional().or(z.literal('')),
    config: homepageSectionConfigSchema.optional().nullable(),
    startDate: z.string().datetime().optional().nullable(),
    endDate: z.string().datetime().optional().nullable(),
    isVisible: z.boolean().default(true),
    showOnMobile: z.boolean().default(true),
    showOnDesktop: z.boolean().default(true),
    sortOrder: z.number().int().default(0),
  })
  .superRefine((val, ctx) => {
    if (val.type === 'PRODUCTS_BY_CATEGORY' && !val.config?.categoryId) {
      ctx.addIssue({
        code: 'custom',
        path: ['config', 'categoryId'],
        message: 'يجب اختيار تصنيف لهذا القسم',
      });
    }
    if (val.type === 'HERO_SLIDER' && !val.config?.slides?.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['config', 'slides'],
        message: 'يجب إضافة شريحة واحدة على الأقل',
      });
    }
  });
export type HomepageSectionDto = z.infer<typeof homepageSectionSchema>;

export const updateHomepageSectionSchema = z.object({
  type: z.enum(HOMEPAGE_SECTION_TYPES).optional(),
  title: z.string().trim().max(120).optional().or(z.literal('')).nullable(),
  subtitle: z.string().trim().max(200).optional().or(z.literal('')).nullable(),
  description: z
    .string()
    .trim()
    .max(500)
    .optional()
    .or(z.literal(''))
    .nullable(),
  config: homepageSectionConfigSchema.optional().nullable(),
  startDate: z.string().datetime().optional().nullable(),
  endDate: z.string().datetime().optional().nullable(),
  isVisible: z.boolean().optional(),
  showOnMobile: z.boolean().optional(),
  showOnDesktop: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});
export type UpdateHomepageSectionDto = z.infer<
  typeof updateHomepageSectionSchema
>;

export const reorderHomepageSectionsSchema = z.object({
  sectionIds: z.array(z.string().uuid()).min(1).max(100),
});
export type ReorderHomepageSectionsDto = z.infer<
  typeof reorderHomepageSectionsSchema
>;
