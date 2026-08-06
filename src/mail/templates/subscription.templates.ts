import { EmailBrand, RenderedEmail, renderEmail } from './layout';

export interface SubscriptionEmailData {
  merchantName: string;
  storeName: string;
  planName: string;
  /** Localised billing cycle label, e.g. "شهرية". */
  billingCycleLabel?: string;
  amount?: string;
  startsAt?: string;
  expiresAt?: string;
  /** Admin-provided reason for suspension/cancellation. */
  reason?: string | null;
  previousPlanName?: string;
  dashboardUrl: string;
}

function baseRows(data: SubscriptionEmailData) {
  return [
    { label: 'المتجر', value: data.storeName },
    { label: 'الباقة', value: data.planName },
    ...(data.billingCycleLabel
      ? [{ label: 'دورة الاشتراك', value: data.billingCycleLabel }]
      : []),
    ...(data.startsAt
      ? [{ label: 'تاريخ البداية', value: data.startsAt }]
      : []),
    ...(data.expiresAt
      ? [{ label: 'تاريخ الانتهاء', value: data.expiresAt }]
      : []),
  ];
}

export function subscriptionRenewedEmail(
  brand: EmailBrand,
  data: SubscriptionEmailData,
): RenderedEmail {
  return renderEmail(brand, `تم تجديد اشتراك متجر ${data.storeName}`, {
    preheader: `اشتراكك في ${brand.name} أصبح ساري المفعول حتى ${data.expiresAt ?? ''}`,
    title: 'تم تجديد اشتراكك',
    badge: { label: 'اشتراك فعّال', tone: 'success' },
    paragraphs: [
      `مرحباً ${data.merchantName}، تم تجديد اشتراك متجر "${data.storeName}" بنجاح.`,
      'يمكنك متابعة تفاصيل اشتراكك وتاريخ انتهائه من صفحة إعدادات المتجر.',
    ],
    rows: [
      ...baseRows(data),
      ...(data.amount
        ? [{ label: 'المبلغ', value: data.amount, emphasis: true }]
        : []),
    ],
    button: { label: 'عرض الاشتراك', url: data.dashboardUrl },
  });
}

export function subscriptionPlanChangedEmail(
  brand: EmailBrand,
  data: SubscriptionEmailData,
): RenderedEmail {
  return renderEmail(brand, `تم تغيير باقة متجر ${data.storeName}`, {
    preheader: `باقتك الجديدة: ${data.planName}`,
    title: 'تم تغيير باقة اشتراكك',
    badge: { label: 'تغيير باقة', tone: 'info' },
    paragraphs: [
      `مرحباً ${data.merchantName}، تم تغيير باقة اشتراك متجر "${data.storeName}".`,
      'قد تتغير المزايا المتاحة لك (عدد المنتجات، التقارير، القوالب) حسب الباقة الجديدة.',
    ],
    rows: [
      ...(data.previousPlanName
        ? [{ label: 'الباقة السابقة', value: data.previousPlanName }]
        : []),
      ...baseRows(data),
      ...(data.amount
        ? [{ label: 'المبلغ', value: data.amount, emphasis: true }]
        : []),
    ],
    button: { label: 'عرض الاشتراك', url: data.dashboardUrl },
  });
}

export function subscriptionSuspendedEmail(
  brand: EmailBrand,
  data: SubscriptionEmailData,
): RenderedEmail {
  return renderEmail(brand, `تم إيقاف اشتراك متجر ${data.storeName}`, {
    preheader: 'تم إيقاف اشتراكك مؤقتاً',
    title: 'تم إيقاف اشتراكك مؤقتاً',
    badge: { label: 'موقوف', tone: 'warning' },
    paragraphs: [
      `مرحباً ${data.merchantName}، تم إيقاف اشتراك متجر "${data.storeName}" مؤقتاً من قبل إدارة المنصة.`,
      'للاستفسار أو إعادة التفعيل، يرجى التواصل مع فريق الدعم.',
    ],
    rows: [
      ...baseRows(data),
      ...(data.reason ? [{ label: 'السبب', value: data.reason }] : []),
    ],
    button: { label: 'الذهاب إلى لوحة التحكم', url: data.dashboardUrl },
  });
}

export function subscriptionCancelledEmail(
  brand: EmailBrand,
  data: SubscriptionEmailData,
): RenderedEmail {
  return renderEmail(brand, `تم إلغاء اشتراك متجر ${data.storeName}`, {
    preheader: 'تم إلغاء اشتراكك في المنصة',
    title: 'تم إلغاء اشتراكك',
    badge: { label: 'ملغى', tone: 'danger' },
    paragraphs: [
      `مرحباً ${data.merchantName}، تم إلغاء اشتراك متجر "${data.storeName}".`,
      'يمكنك التواصل مع فريق الدعم في أي وقت لإعادة الاشتراك.',
    ],
    rows: [
      ...baseRows(data),
      ...(data.reason ? [{ label: 'السبب', value: data.reason }] : []),
    ],
    button: { label: 'التواصل مع الدعم', url: data.dashboardUrl },
  });
}

export function subscriptionPaymentReceivedEmail(
  brand: EmailBrand,
  data: SubscriptionEmailData,
): RenderedEmail {
  return renderEmail(brand, `تم تأكيد دفعة اشتراك متجر ${data.storeName}`, {
    preheader: `تم تسجيل دفعتك بقيمة ${data.amount ?? ''}`,
    title: 'تم تأكيد استلام الدفعة',
    badge: { label: 'مدفوع', tone: 'success' },
    paragraphs: [
      `مرحباً ${data.merchantName}، تم تسجيل دفعة اشتراك متجر "${data.storeName}" بنجاح.`,
    ],
    rows: [
      ...baseRows(data),
      ...(data.amount
        ? [{ label: 'المبلغ المدفوع', value: data.amount, emphasis: true }]
        : []),
    ],
    button: { label: 'عرض الاشتراك', url: data.dashboardUrl },
  });
}
