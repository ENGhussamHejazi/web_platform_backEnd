export interface ReceiptEmailData {
  merchantName: string;
  storeName: string;
  applicationReference: string;
  statusPageUrl: string;
}

function wrapHtml(bodyHtml: string, buttonLabel: string, buttonUrl: string) {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f1f5f9;font-family:Tahoma,Arial,sans-serif;">
    <table role="presentation" width="100%" style="padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" style="max-width:480px;background:#ffffff;border-radius:12px;overflow:hidden;">
            <tr><td style="background:#0EA5A4;padding:20px;text-align:center;color:#fff;font-size:18px;font-weight:bold;">سوق سوريا</td></tr>
            <tr><td style="padding:24px;color:#1e293b;font-size:14px;line-height:1.9;">${bodyHtml}</td></tr>
            <tr>
              <td style="padding:0 24px 28px;text-align:center;">
                <a href="${buttonUrl}" style="display:inline-block;background:#0EA5A4;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:bold;">${buttonLabel}</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function receiptEmailAr(data: ReceiptEmailData) {
  const subject = 'تم استلام طلب فتح متجرك بنجاح';
  const text = `مرحباً ${data.merchantName}،

تم استلام طلب فتح متجرك "${data.storeName}" بنجاح.

رقم الطلب: ${data.applicationReference}

طلبك الآن بانتظار المراجعة من فريق الإدارة. سنرسل لك إشعاراً جديداً عند بدء المراجعة أو عند طلب تعديلات أو عند اتخاذ القرار النهائي.

يمكنك تسجيل الدخول إلى حسابك لمتابعة حالة الطلب واستيفاء أي معلومات مطلوبة.

الحالة الحالية: تم الإرسال — بانتظار المراجعة

مع التحية،
فريق المنصة`;
  const html = wrapHtml(
    `مرحباً <b>${data.merchantName}</b>،<br/><br/>
    تم استلام طلب فتح متجرك "<b>${data.storeName}</b>" بنجاح.<br/><br/>
    رقم الطلب: <b>${data.applicationReference}</b><br/><br/>
    طلبك الآن بانتظار المراجعة من فريق الإدارة. سنرسل لك إشعاراً جديداً عند بدء المراجعة أو عند طلب تعديلات أو عند اتخاذ القرار النهائي.<br/><br/>
    الحالة الحالية: <b>تم الإرسال — بانتظار المراجعة</b>`,
    'متابعة حالة الطلب',
    data.statusPageUrl,
  );
  return { subject, text, html };
}

export function receiptEmailEn(data: ReceiptEmailData) {
  const subject = 'Your store application has been received';
  const text = `Hello ${data.merchantName},

We have successfully received your application to open "${data.storeName}".

Application reference: ${data.applicationReference}

Your application is now waiting for review by the administration team. We will send you another notification when the review begins, when changes are requested, or when a final decision is made.

You can sign in to your account to track the application status and complete any requested information.

Current status: Submitted — Awaiting Review

Regards,
Platform Team`;
  const html = wrapHtml(
    `Hello <b>${data.merchantName}</b>,<br/><br/>
    We have successfully received your application to open "<b>${data.storeName}</b>".<br/><br/>
    Application reference: <b>${data.applicationReference}</b><br/><br/>
    Your application is now waiting for review by the administration team. We will send you another notification when the review begins, when changes are requested, or when a final decision is made.<br/><br/>
    Current status: <b>Submitted — Awaiting Review</b>`,
    'Track Application Status',
    data.statusPageUrl,
  );
  return { subject, text, html };
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

export function statusChangeEmail(
  lang: 'ar' | 'en',
  status: string,
  data: ReceiptEmailData,
) {
  const isAr = lang === 'ar';
  const message = isAr
    ? (STATUS_MESSAGES_AR[status] ?? 'تم تحديث حالة طلب متجرك.')
    : (STATUS_MESSAGES_EN[status] ??
      'Your store application status was updated.');
  const subject = isAr
    ? `تحديث حالة طلب متجرك: ${data.storeName}`
    : `Update on your store application: ${data.storeName}`;
  const buttonLabel = isAr ? 'متابعة حالة الطلب' : 'Track Application Status';
  const text = `${isAr ? 'مرحباً' : 'Hello'} ${data.merchantName},\n\n${message}\n\n${
    isAr ? 'رقم الطلب' : 'Application reference'
  }: ${data.applicationReference}\n\n${data.statusPageUrl}`;
  const html = wrapHtml(
    `${isAr ? 'مرحباً' : 'Hello'} <b>${data.merchantName}</b>،<br/><br/>${message}<br/><br/>${
      isAr ? 'رقم الطلب' : 'Application reference'
    }: <b>${data.applicationReference}</b>`,
    buttonLabel,
    data.statusPageUrl,
  );
  return { subject, text, html };
}
