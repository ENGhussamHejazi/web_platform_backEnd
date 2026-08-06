import { EmailBrand, RenderedEmail, renderEmail } from './templates/layout';

/**
 * Store-application lifecycle emails.
 *
 * These predate the shared layout and originally carried their own inline
 * HTML; they now render through `templates/layout` like every other email, so
 * a merchant's application mails and their order/subscription mails look like
 * one system. The exported signatures are unchanged.
 */

export interface ReceiptEmailData {
  merchantName: string;
  storeName: string;
  applicationReference: string;
  statusPageUrl: string;
}

const PLATFORM_BRAND: EmailBrand = { name: 'TRENDWA', color: '#0EA5A4' };

export function receiptEmailAr(data: ReceiptEmailData): RenderedEmail {
  return renderEmail(PLATFORM_BRAND, 'تم استلام طلب فتح متجرك بنجاح', {
    preheader: `طلب فتح متجر "${data.storeName}" قيد المراجعة`,
    title: 'تم استلام طلبك بنجاح',
    badge: { label: 'بانتظار المراجعة', tone: 'info' },
    paragraphs: [
      `مرحباً ${data.merchantName}، تم استلام طلب فتح متجرك "${data.storeName}" بنجاح.`,
      'طلبك الآن بانتظار المراجعة من فريق الإدارة. سنرسل لك إشعاراً جديداً عند بدء المراجعة، أو عند طلب تعديلات، أو عند اتخاذ القرار النهائي.',
      'يمكنك تسجيل الدخول إلى حسابك لمتابعة حالة الطلب واستيفاء أي معلومات مطلوبة.',
    ],
    rows: [
      { label: 'رقم الطلب', value: data.applicationReference },
      { label: 'اسم المتجر', value: data.storeName },
      { label: 'الحالة الحالية', value: 'تم الإرسال — بانتظار المراجعة' },
    ],
    button: { label: 'متابعة حالة الطلب', url: data.statusPageUrl },
  });
}

export function receiptEmailEn(data: ReceiptEmailData): RenderedEmail {
  return renderEmail(
    PLATFORM_BRAND,
    'Your store application has been received',
    {
      preheader: `Application for "${data.storeName}" is under review`,
      title: 'We received your application',
      badge: { label: 'Awaiting review', tone: 'info' },
      paragraphs: [
        `Hello ${data.merchantName}, we have successfully received your application to open "${data.storeName}".`,
        'Your application is now waiting for review by the administration team. We will notify you when the review begins, when changes are requested, or when a final decision is made.',
        'You can sign in to your account to track the application status and complete any requested information.',
      ],
      rows: [
        { label: 'Application reference', value: data.applicationReference },
        { label: 'Store name', value: data.storeName },
        { label: 'Current status', value: 'Submitted — Awaiting Review' },
      ],
      button: { label: 'Track Application Status', url: data.statusPageUrl },
    },
  );
}

const STATUS_MESSAGES_AR: Record<string, string> = {
  UNDER_REVIEW: 'بدأ فريق الإدارة بمراجعة طلب متجرك.',
  CHANGES_REQUESTED:
    'طلب فريق الإدارة تعديلات على طلب متجرك، الرجاء مراجعة التفاصيل وإعادة الإرسال.',
  APPROVED: 'تهانينا! تمت الموافقة على طلب متجرك وتم تفعيله.',
  REJECTED: 'نأسف، تم رفض طلب فتح متجرك.',
  SUSPENDED: 'تم إيقاف طلب متجرك من قبل إدارة المنصة.',
};

const STATUS_MESSAGES_EN: Record<string, string> = {
  UNDER_REVIEW: 'Our team has started reviewing your store application.',
  CHANGES_REQUESTED:
    'Changes were requested on your store application — please review and resubmit.',
  APPROVED:
    'Congratulations! Your store application has been approved and activated.',
  REJECTED: 'Unfortunately, your store application has been rejected.',
  SUSPENDED:
    'Your store application has been suspended by the platform administration.',
};

const STATUS_LABELS_AR: Record<string, string> = {
  UNDER_REVIEW: 'قيد المراجعة',
  CHANGES_REQUESTED: 'مطلوب تعديلات',
  APPROVED: 'تمت الموافقة',
  REJECTED: 'مرفوض',
  SUSPENDED: 'موقوف',
};

const STATUS_LABELS_EN: Record<string, string> = {
  UNDER_REVIEW: 'Under review',
  CHANGES_REQUESTED: 'Changes requested',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  SUSPENDED: 'Suspended',
};

const STATUS_TONES: Record<string, 'info' | 'success' | 'warning' | 'danger'> =
  {
    UNDER_REVIEW: 'info',
    CHANGES_REQUESTED: 'warning',
    APPROVED: 'success',
    REJECTED: 'danger',
    SUSPENDED: 'danger',
  };

export function statusChangeEmail(
  lang: 'ar' | 'en',
  status: string,
  data: ReceiptEmailData,
): RenderedEmail {
  const isAr = lang === 'ar';
  const message = isAr
    ? (STATUS_MESSAGES_AR[status] ?? 'تم تحديث حالة طلب متجرك.')
    : (STATUS_MESSAGES_EN[status] ??
      'Your store application status was updated.');
  const label = isAr
    ? (STATUS_LABELS_AR[status] ?? status)
    : (STATUS_LABELS_EN[status] ?? status);

  return renderEmail(
    PLATFORM_BRAND,
    isAr
      ? `تحديث حالة طلب متجرك: ${data.storeName}`
      : `Update on your store application: ${data.storeName}`,
    {
      preheader: isAr ? `الحالة الجديدة: ${label}` : `New status: ${label}`,
      title: isAr ? 'تحديث على طلب متجرك' : 'Your application was updated',
      badge: { label, tone: STATUS_TONES[status] ?? 'info' },
      paragraphs: [
        isAr ? `مرحباً ${data.merchantName},` : `Hello ${data.merchantName},`,
        message,
      ],
      rows: [
        {
          label: isAr ? 'رقم الطلب' : 'Application reference',
          value: data.applicationReference,
        },
        { label: isAr ? 'اسم المتجر' : 'Store name', value: data.storeName },
        {
          label: isAr ? 'الحالة الحالية' : 'Current status',
          value: label,
          emphasis: true,
        },
      ],
      button: {
        label: isAr ? 'متابعة حالة الطلب' : 'Track Application Status',
        url: data.statusPageUrl,
      },
    },
  );
}
