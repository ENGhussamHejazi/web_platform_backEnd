import { EmailBrand, RenderedEmail, renderEmail } from './layout';

export interface MerchantWelcomeData {
  merchantName: string;
  storeName: string;
  planName: string;
  billingCycle: 'MONTHLY' | 'YEARLY';
  dashboardUrl: string;
  /** Formatted end date of the free trial month, when one was granted. */
  trialEndsAt?: string;
}

export function merchantWelcomeEmail(
  brand: EmailBrand,
  data: MerchantWelcomeData,
): RenderedEmail {
  return renderEmail(brand, `أهلاً بك في ${brand.name} — تم إنشاء حسابك`, {
    preheader: data.trialEndsAt
      ? `متجر "${data.storeName}" جاهز — شهرك الأول مجاناً`
      : `تم إنشاء متجر "${data.storeName}" بنجاح`,
    title: `أهلاً بك يا ${data.merchantName}!`,
    badge: data.trialEndsAt
      ? { label: 'شهرك الأول مجاناً', tone: 'success' }
      : { label: 'تم إنشاء الحساب', tone: 'success' },
    paragraphs: [
      `تم إنشاء حسابك ومتجر "${data.storeName}" على منصة ${brand.name} بنجاح.`,
      ...(data.trialEndsAt
        ? [
            `اشتراكك الآن في فترة تجربة مجانية لمدة شهر حتى ${data.trialEndsAt} — لا يوجد أي مبلغ مستحق خلالها، وكل مزايا باقة "${data.planName}" متاحة لك.`,
          ]
        : []),
      'الخطوة التالية: أكمل بيانات طلب فتح المتجر من لوحة التحكم حتى يتمكن فريق الإدارة من مراجعته وتفعيل متجرك. لن يظهر متجرك للعملاء قبل الموافقة.',
    ],
    rows: [
      { label: 'اسم المتجر', value: data.storeName },
      { label: 'الباقة المختارة', value: data.planName },
      {
        label: 'دورة الاشتراك بعد التجربة',
        value: data.billingCycle === 'YEARLY' ? 'سنوية' : 'شهرية',
      },
      ...(data.trialEndsAt
        ? [
            {
              label: 'تنتهي التجربة المجانية في',
              value: data.trialEndsAt,
              emphasis: true,
            },
          ]
        : []),
      { label: 'حالة المتجر', value: 'بانتظار استكمال الطلب' },
    ],
    button: { label: 'الذهاب إلى لوحة التحكم', url: data.dashboardUrl },
    footnote:
      'وصلتك هذه الرسالة لأنه تم التسجيل بهذا البريد على المنصة. إن لم تكن أنت، تجاهل الرسالة أو تواصل مع الدعم.',
  });
}

export interface AdminNewMerchantData {
  merchantName: string;
  merchantEmail: string;
  merchantPhone: string;
  storeName: string;
  planName: string;
  adminStoresUrl: string;
}

export function adminNewMerchantEmail(
  brand: EmailBrand,
  data: AdminNewMerchantData,
): RenderedEmail {
  return renderEmail(brand, `تسجيل تاجر جديد: ${data.storeName}`, {
    preheader: `${data.merchantName} سجّل متجراً جديداً على المنصة`,
    title: 'تسجيل تاجر جديد',
    badge: { label: 'يتطلب متابعة', tone: 'info' },
    paragraphs: [
      'تم تسجيل تاجر جديد على المنصة. سيصلك إشعار منفصل عند إرسال طلب فتح المتجر رسمياً للمراجعة.',
    ],
    rows: [
      { label: 'اسم التاجر', value: data.merchantName },
      { label: 'البريد الإلكتروني', value: data.merchantEmail },
      { label: 'رقم الهاتف', value: data.merchantPhone },
      { label: 'اسم المتجر', value: data.storeName },
      { label: 'الباقة', value: data.planName },
    ],
    button: { label: 'عرض المتاجر', url: data.adminStoresUrl },
  });
}

export interface CustomerWelcomeData {
  customerName: string;
  storeName: string;
  storeUrl: string;
}

export function customerWelcomeEmail(
  brand: EmailBrand,
  data: CustomerWelcomeData,
): RenderedEmail {
  return renderEmail(brand, `أهلاً بك في ${data.storeName}`, {
    preheader: `تم إنشاء حسابك في متجر ${data.storeName}`,
    title: `أهلاً بك يا ${data.customerName}!`,
    badge: { label: 'تم إنشاء الحساب', tone: 'success' },
    paragraphs: [
      `تم إنشاء حسابك في متجر ${data.storeName} بنجاح.`,
      'يمكنك الآن تتبّع طلباتك، حفظ عناوين الشحن، وإدارة قائمة مفضلاتك من صفحة حسابك.',
    ],
    button: { label: 'تسوّق الآن', url: data.storeUrl },
    footnote:
      'وصلتك هذه الرسالة لأنه تم إنشاء حساب بهذا البريد في هذا المتجر. إن لم تكن أنت، تجاهل الرسالة.',
  });
}

export interface PasswordResetData {
  resetUrl: string;
  expiresInMinutes: number;
}

export function passwordResetEmail(
  brand: EmailBrand,
  data: PasswordResetData,
): RenderedEmail {
  return renderEmail(brand, `استعادة كلمة المرور — ${brand.name}`, {
    preheader: 'رابط تعيين كلمة مرور جديدة لحسابك',
    title: 'استعادة كلمة المرور',
    paragraphs: [
      `تلقّينا طلباً لاستعادة كلمة المرور لحسابك في ${brand.name}.`,
      `الرابط صالح لمدة ${data.expiresInMinutes} دقيقة ويُستخدم مرة واحدة فقط.`,
    ],
    button: { label: 'تعيين كلمة مرور جديدة', url: data.resetUrl },
    footnote:
      'إذا لم تطلب استعادة كلمة المرور، تجاهل هذه الرسالة — لن يتغير شيء في حسابك.',
  });
}
