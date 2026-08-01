import { z } from 'zod';

export const accountInfoSchema = z.object({
  whatsapp: z
    .string()
    .regex(/^09\d{8}$/u, 'رقم الواتساب يجب أن يكون بصيغة 09XXXXXXXX')
    .optional(),
  country: z.string().min(1).max(60).optional(),
  city: z.string().min(1).max(60).optional(),
  preferredLanguage: z.enum(['ar', 'en']).optional(),
  preferredContactMethod: z.enum(['phone', 'whatsapp', 'email']).optional(),
  termsAccepted: z.boolean().optional(),
  privacyAccepted: z.boolean().optional(),
});
export type AccountInfoDto = z.infer<typeof accountInfoSchema>;

export const socialLinksSchema = z.object({
  instagram: z.string().url().optional().or(z.literal('')),
  tiktok: z.string().url().optional().or(z.literal('')),
  snapchat: z.string().url().optional().or(z.literal('')),
  facebook: z.string().url().optional().or(z.literal('')),
  whatsapp: z.string().optional(),
  telegram: z.string().url().optional().or(z.literal('')),
  website: z.string().url().optional().or(z.literal('')),
});

export const storeInfoSchema = z.object({
  nameAr: z.string().min(2).max(120).optional(),
  nameEn: z.string().max(120).optional(),
  category: z.string().min(1).max(60).optional(),
  subcategory: z.string().max(60).optional(),
  description: z.string().max(500).optional(),
  logoUrl: z.string().url().optional(),
  coverUrl: z.string().url().optional(),
  csPhone: z
    .string()
    .regex(/^09\d{8}$/u, 'رقم هاتف خدمة العملاء يجب أن يكون بصيغة 09XXXXXXXX')
    .optional(),
  csWhatsapp: z.string().optional(),
  publicEmail: z.string().email().optional(),
  currency: z.string().min(2).max(10).optional(),
  defaultLanguage: z.enum(['ar', 'en']).optional(),
  socialLinks: socialLinksSchema.partial().optional(),
});
export type StoreInfoDto = z.infer<typeof storeInfoSchema>;

export const physicalBusinessInfoSchema = z.object({
  legalBusinessName: z.string().max(150).optional(),
  physicalStoreName: z.string().max(150).optional(),
  branchCount: z.number().int().positive().optional(),
  mainBranchAddress: z.string().max(300).optional(),
  googleMapsUrl: z.string().url().optional(),
  storePhone: z.string().optional(),
  workingDays: z.array(z.string()).optional(),
  openingTime: z.string().optional(),
  closingTime: z.string().optional(),
  hasInventory: z.boolean().optional(),
  pickupAvailable: z.boolean().optional(),
  localDeliveryAvailable: z.boolean().optional(),
  warehouseLocation: z.string().optional(),
});

export const onlineBusinessInfoSchema = z.object({
  sellingModel: z
    .enum([
      'own_products',
      'reselling',
      'dropshipping',
      'preorder',
      'handmade',
      'digital_products',
      'affiliate_marketing',
    ])
    .optional(),
  productSource: z.string().max(200).optional(),
  ownsProducts: z.boolean().optional(),
  holdsInventory: z.boolean().optional(),
  storageLocation: z.string().optional(),
  sellingPlatforms: z.array(z.string()).optional(),
  socialSellingLinks: z.array(z.string()).optional(),
  orderVolume: z.string().optional(),
  avgOrderPrepTime: z.string().optional(),
});

// Business info is conditional on merchantType, so the wizard sends a loose
// object and the service applies the right shape based on the application's
// stored merchantType.
export const businessInfoSchema = z.object({}).catchall(z.unknown());
export type BusinessInfoDto = Record<string, unknown>;

export const shippingInfoSchema = z.object({
  deliveryCities: z.array(z.string()).optional(),
  deliveryRegions: z.array(z.string()).optional(),
  deliveryMethod: z
    .enum([
      'merchant_driver',
      'shipping_company',
      'store_pickup',
      'manual_delivery',
    ])
    .optional(),
  deliveryFee: z.number().nonnegative().optional(),
  freeDeliveryThreshold: z.number().nonnegative().optional(),
  avgPrepTime: z.string().optional(),
  avgDeliveryTime: z.string().optional(),
  storePickupAvailable: z.boolean().optional(),
  codAvailable: z.boolean().optional(),
  bankTransferAvailable: z.boolean().optional(),
  returnPolicy: z.string().max(1000).optional(),
  shippingPolicy: z.string().max(1000).optional(),
});
export type ShippingInfoDto = z.infer<typeof shippingInfoSchema>;

export const patchApplicationSchema = z.object({
  currentStep: z.number().int().min(1).max(6).optional(),
  accountInfo: accountInfoSchema.optional(),
  storeInfo: storeInfoSchema.optional(),
  businessInfo: businessInfoSchema.optional(),
  shippingInfo: shippingInfoSchema.optional(),
});
export type PatchApplicationDto = z.infer<typeof patchApplicationSchema>;

export const addDocumentBodySchema = z.object({
  type: z.enum([
    'identity',
    'commercial_registration',
    'tax_number',
    'business_license',
    'bank_ownership',
    'authorized_representative',
  ]),
  identityNumber: z.string().max(60).optional(),
  expiryDate: z.string().datetime().optional(),
});
export type AddDocumentBodyDto = z.infer<typeof addDocumentBodySchema>;

export const startReviewSchema = z.object({});

export const requestChangesSchema = z.object({
  message: z.string().min(5, 'الرجاء توضيح التعديلات المطلوبة').max(1000),
  fields: z.array(z.string()).default([]),
});
export type RequestChangesDto = z.infer<typeof requestChangesSchema>;

export const rejectApplicationSchema = z.object({
  reason: z.string().min(5, 'سبب الرفض مطلوب').max(1000),
});
export type RejectApplicationDto = z.infer<typeof rejectApplicationSchema>;

export const suspendApplicationSchema = z.object({
  reason: z.string().min(5, 'سبب الإيقاف مطلوب').max(1000),
});
export type SuspendApplicationDto = z.infer<typeof suspendApplicationSchema>;

export const listApplicationsQuerySchema = z.object({
  status: z.string().optional(),
  merchantType: z.string().optional(),
  search: z.string().optional(),
});
export type ListApplicationsQueryDto = z.infer<
  typeof listApplicationsQuerySchema
>;
