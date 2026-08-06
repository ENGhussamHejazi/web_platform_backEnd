import { z } from 'zod';
import { STORE_BUSINESS_CATEGORIES } from '../../entitlements/business-categories';
import { trustedEmailSchema } from '../../common/email.validation';

export const registerCustomerSchema = z.object({
  name: z.string().min(2, 'الاسم قصير جداً').max(100),
  email: trustedEmailSchema,
  password: z.string().min(8, 'كلمة المرور يجب أن تكون 8 أحرف على الأقل'),
  phone: z
    .string()
    .min(1, 'رقم الهاتف مطلوب')
    .regex(/^09\d{8}$/u, 'رقم الهاتف يجب أن يكون بصيغة 09XXXXXXXX'),
});
export type RegisterCustomerDto = z.infer<typeof registerCustomerSchema>;

export const registerMerchantSchema = z.object({
  name: z.string().min(2, 'الاسم قصير جداً').max(100),
  email: trustedEmailSchema,
  password: z.string().min(8, 'كلمة المرور يجب أن تكون 8 أحرف على الأقل'),
  phone: z
    .string()
    .min(1, 'رقم الهاتف مطلوب')
    .regex(/^09\d{8}$/u, 'رقم الهاتف يجب أن يكون بصيغة 09XXXXXXXX'),
  storeName: z.string().min(2, 'اسم المتجر قصير جداً').max(120),
  storeSlug: z
    .string()
    .min(3, 'رابط المتجر قصير جداً')
    .max(60)
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/u,
      'رابط المتجر يجب أن يحتوي على أحرف إنجليزية صغيرة وأرقام وشرطات فقط',
    ),
  planId: z.string().uuid('يجب اختيار باقة'),
  billingCycle: z.enum(['MONTHLY', 'YEARLY']),
  merchantType: z.enum(['PHYSICAL_STORE_OWNER', 'ONLINE_SELLER'], {
    message: 'الرجاء اختيار نوع النشاط التجاري',
  }),
  businessCategories: z
    .array(z.enum(STORE_BUSINESS_CATEGORIES))
    .min(1, 'الرجاء اختيار تصنيف واحد على الأقل لنشاط المتجر'),
  termsAccepted: z.literal(true, {
    message: 'يجب الموافقة على الشروط والأحكام',
  }),
  privacyAccepted: z.literal(true, {
    message: 'يجب الموافقة على سياسة الخصوصية',
  }),
});
export type RegisterMerchantDto = z.infer<typeof registerMerchantSchema>;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('البريد الإلكتروني غير صالح'),
  password: z.string().min(1, 'كلمة المرور مطلوبة'),
});
export type LoginDto = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email('البريد الإلكتروني غير صالح'),
});
export type ForgotPasswordDto = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().trim().min(32, 'رابط الاستعادة غير صالح'),
  password: z
    .string()
    .min(8, 'كلمة المرور يجب أن تكون 8 أحرف على الأقل')
    .max(128, 'كلمة المرور طويلة جداً')
    .regex(/[a-zA-Z]/u, 'كلمة المرور يجب أن تحتوي على حرف واحد على الأقل')
    .regex(/\d/u, 'كلمة المرور يجب أن تحتوي على رقم واحد على الأقل'),
});
export type ResetPasswordDto = z.infer<typeof resetPasswordSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'رمز التحديث مطلوب'),
});
export type RefreshDto = z.infer<typeof refreshSchema>;
