import { EmailBrand } from './layout';
import {
  adminNewMerchantEmail,
  customerWelcomeEmail,
  merchantWelcomeEmail,
  passwordResetEmail,
} from './account.templates';
import {
  OrderEmailData,
  merchantNewOrderEmail,
  orderCancelledEmail,
  orderConfirmationEmail,
  orderStatusUpdateEmail,
  refundIssuedEmail,
  returnStatusEmail,
} from './order.templates';
import {
  SubscriptionEmailData,
  subscriptionCancelledEmail,
  subscriptionPaymentReceivedEmail,
  subscriptionPlanChangedEmail,
  subscriptionRenewedEmail,
  subscriptionSuspendedEmail,
} from './subscription.templates';
import {
  receiptEmailAr,
  receiptEmailEn,
  statusChangeEmail,
} from '../email-templates';

const PLATFORM: EmailBrand = { name: 'TRENDWA', color: '#0EA5A4' };
const STORE: EmailBrand = { name: 'متجر الشام', color: '#7C3AED' };

/** Every template must produce a usable subject and both body formats. */
function expectWellFormed(out: {
  subject: string;
  html: string;
  text: string;
}) {
  expect(out.subject.trim().length).toBeGreaterThan(0);
  expect(out.html).toContain('<!doctype html>');
  expect(out.text.trim().length).toBeGreaterThan(0);
}

// ---------------------------------------------------------------------------
// Account templates
// ---------------------------------------------------------------------------

describe('account templates', () => {
  describe('merchantWelcomeEmail', () => {
    const data = {
      merchantName: 'حسام',
      storeName: 'متجر الشام',
      planName: 'احترافي',
      billingCycle: 'MONTHLY' as const,
      dashboardUrl: 'https://app.test/merchant',
    };

    it('greets the merchant and names the store and plan', () => {
      const out = merchantWelcomeEmail(PLATFORM, data);
      expectWellFormed(out);
      expect(out.text).toContain('حسام');
      expect(out.text).toContain('متجر الشام');
      expect(out.text).toContain('احترافي');
    });

    it('tells the merchant the store is not live until the application is completed', () => {
      const out = merchantWelcomeEmail(PLATFORM, data);
      expect(out.text).toContain('بانتظار استكمال الطلب');
      expect(out.text).toContain('لن يظهر متجرك للعملاء قبل الموافقة');
    });

    it('links to the merchant dashboard', () => {
      expect(merchantWelcomeEmail(PLATFORM, data).text).toContain(
        'https://app.test/merchant',
      );
    });

    it.each([
      ['MONTHLY' as const, 'شهرية'],
      ['YEARLY' as const, 'سنوية'],
    ])('localises the %s billing cycle as %s', (billingCycle, label) => {
      const out = merchantWelcomeEmail(PLATFORM, { ...data, billingCycle });
      expect(out.text).toContain(label);
    });
  });

  describe('adminNewMerchantEmail', () => {
    const data = {
      merchantName: 'حسام',
      merchantEmail: 'm@test.com',
      merchantPhone: '0999',
      storeName: 'متجر الشام',
      planName: 'احترافي',
      adminStoresUrl: 'https://app.test/admin/stores',
    };

    it('carries every contact detail an admin needs to follow up', () => {
      const out = adminNewMerchantEmail(PLATFORM, data);
      expectWellFormed(out);
      expect(out.text).toContain('m@test.com');
      expect(out.text).toContain('0999');
      expect(out.text).toContain('متجر الشام');
      expect(out.text).toContain('https://app.test/admin/stores');
    });

    it('names the store in the subject so admins can triage from the inbox list', () => {
      expect(adminNewMerchantEmail(PLATFORM, data).subject).toContain(
        'متجر الشام',
      );
    });
  });

  describe('customerWelcomeEmail', () => {
    const data = {
      customerName: 'سامر',
      storeName: 'متجر الشام',
      storeUrl: 'https://app.test/store/sham',
    };

    it('is branded as the store, never as the platform', () => {
      const out = customerWelcomeEmail(STORE, data);
      expectWellFormed(out);
      expect(out.subject).toContain('متجر الشام');
      expect(out.html).toContain('#7C3AED');
      expect(out.text).not.toContain('TRENDWA');
    });

    it('links back to the storefront', () => {
      expect(customerWelcomeEmail(STORE, data).text).toContain(
        'https://app.test/store/sham',
      );
    });
  });

  describe('passwordResetEmail', () => {
    const data = {
      resetUrl: 'https://app.test/reset?token=abc',
      expiresInMinutes: 30,
    };

    it('includes the reset link and its expiry', () => {
      const out = passwordResetEmail(PLATFORM, data);
      expectWellFormed(out);
      expect(out.text).toContain('https://app.test/reset?token=abc');
      expect(out.text).toContain('30 دقيقة');
    });

    it('tells a recipient who did not request it that they can ignore it', () => {
      expect(passwordResetEmail(PLATFORM, data).text).toContain(
        'إذا لم تطلب استعادة كلمة المرور',
      );
    });

    it('adopts whichever brand it is given, so store customers see their store', () => {
      expect(passwordResetEmail(STORE, data).subject).toContain('متجر الشام');
      expect(passwordResetEmail(PLATFORM, data).subject).toContain('TRENDWA');
    });
  });
});

// ---------------------------------------------------------------------------
// Order templates
// ---------------------------------------------------------------------------

const ORDER: OrderEmailData = {
  orderReference: '#ABC12345',
  customerName: 'سامر',
  storeName: 'متجر الشام',
  placedAt: '١ آب ٢٠٢٦',
  items: [
    { name: 'زيت زيتون', quantity: '2', lineTotal: '1,000 SYP' },
    { name: 'صابون غار', quantity: '1', lineTotal: '500 SYP' },
  ],
  subtotal: '1,500 SYP',
  shippingCost: '100 SYP',
  total: '1,600 SYP',
  paymentMethodLabel: 'الدفع عند الاستلام',
  fulfillmentLabel: 'توصيل',
  shippingAddress: 'دمشق - المزة',
  orderUrl: 'https://app.test/store/sham/account/orders/o1',
};

describe('orderConfirmationEmail', () => {
  it('lists every purchased item with quantity and line total', () => {
    const out = orderConfirmationEmail(STORE, ORDER);
    expectWellFormed(out);
    expect(out.text).toContain('زيت زيتون');
    expect(out.text).toContain('صابون غار');
    expect(out.text).toContain('1,000 SYP');
  });

  it('shows the full money breakdown', () => {
    const out = orderConfirmationEmail(STORE, ORDER);
    expect(out.text).toContain('المجموع الفرعي: 1,500 SYP');
    expect(out.text).toContain('تكلفة الشحن: 100 SYP');
    expect(out.text).toContain('الإجمالي: 1,600 SYP');
  });

  it('omits the discount row when there is no discount', () => {
    expect(orderConfirmationEmail(STORE, ORDER).text).not.toContain('الخصم');
  });

  it('shows the discount row when one applies', () => {
    const out = orderConfirmationEmail(STORE, {
      ...ORDER,
      discount: '- 200 SYP',
    });
    expect(out.text).toContain('الخصم: - 200 SYP');
  });

  it('shows the delivery address for a delivery order', () => {
    expect(orderConfirmationEmail(STORE, ORDER).text).toContain('دمشق - المزة');
  });

  it('omits the address row for a pickup order', () => {
    const out = orderConfirmationEmail(STORE, {
      ...ORDER,
      fulfillmentLabel: 'استلام من المتجر',
      shippingAddress: undefined,
    });
    expect(out.text).not.toContain('عنوان التوصيل');
  });

  it('puts the order reference in the subject', () => {
    expect(orderConfirmationEmail(STORE, ORDER).subject).toContain('#ABC12345');
  });

  it('links to the customer order page', () => {
    expect(orderConfirmationEmail(STORE, ORDER).text).toContain(ORDER.orderUrl);
  });
});

describe('orderStatusUpdateEmail', () => {
  const base = {
    orderReference: '#ABC12345',
    customerName: 'سامر',
    storeName: 'متجر الشام',
    orderUrl: 'https://app.test/o/1',
  };

  it.each([
    ['CONFIRMED', 'تم التأكيد'],
    ['PROCESSING', 'قيد التجهيز'],
    ['SHIPPED', 'تم الشحن'],
    ['OUT_FOR_DELIVERY', 'قيد التوصيل'],
    ['DELIVERED', 'تم التوصيل'],
    ['CANCELLED', 'تم الإلغاء'],
    ['PENDING', 'قيد المراجعة'],
  ])('renders %s with its Arabic label and a real message', (status, label) => {
    const out = orderStatusUpdateEmail(STORE, { ...base, status });
    expectWellFormed(out);
    expect(out.subject).toContain(label);
    expect(out.text).toContain(label);
  });

  it('degrades gracefully for a status it has no copy for', () => {
    const out = orderStatusUpdateEmail(STORE, { ...base, status: 'WEIRD' });
    expectWellFormed(out);
    expect(out.text).toContain('تم تحديث حالة طلبك');
    expect(out.subject).toContain('WEIRD');
  });

  it('invites a review only once the order is delivered', () => {
    const delivered = orderStatusUpdateEmail(STORE, {
      ...base,
      status: 'DELIVERED',
    });
    const shipped = orderStatusUpdateEmail(STORE, {
      ...base,
      status: 'SHIPPED',
    });
    expect(delivered.text).toContain('قيّم منتجاتك');
    expect(shipped.text).toContain('تتبّع الطلب');
    expect(shipped.text).not.toContain('قيّم منتجاتك');
  });

  it.each(['SHIPPED', 'OUT_FOR_DELIVERY'])(
    'surfaces the driver contact on %s, when the merchant has assigned one',
    (status) => {
      const out = orderStatusUpdateEmail(STORE, {
        ...base,
        status,
        driverName: 'أبو علي',
        driverPhone: '0988',
      });
      expect(out.text).toContain('أبو علي');
      expect(out.text).toContain('0988');
    },
  );

  it('omits driver rows when no driver is assigned', () => {
    const out = orderStatusUpdateEmail(STORE, { ...base, status: 'SHIPPED' });
    expect(out.text).not.toContain('مندوب التوصيل');
  });

  it('includes the tracking number and estimated delivery when present', () => {
    const out = orderStatusUpdateEmail(STORE, {
      ...base,
      status: 'SHIPPED',
      trackingNumber: 'TRK-9',
      estimatedDelivery: '٥ آب ٢٠٢٦',
    });
    expect(out.text).toContain('TRK-9');
    expect(out.text).toContain('٥ آب ٢٠٢٦');
  });

  it('relays the merchant note, e.g. the cancellation reason', () => {
    const out = orderStatusUpdateEmail(STORE, {
      ...base,
      status: 'CANCELLED',
      note: 'نفد المخزون',
    });
    expect(out.text).toContain('نفد المخزون');
  });
});

describe('merchantNewOrderEmail', () => {
  const data = {
    orderReference: '#ABC12345',
    storeName: 'متجر الشام',
    buyerName: 'سامر',
    buyerPhone: '0999',
    buyerEmail: 'buyer@test.com',
    placedAt: '١ آب ٢٠٢٦',
    itemCount: 2,
    total: '1,600 SYP',
    paymentMethodLabel: 'الدفع عند الاستلام',
    fulfillmentLabel: 'توصيل',
    governorate: 'DAMASCUS',
    orderUrl: 'https://app.test/merchant/orders/o1',
  };

  it('puts the reference and total in the subject for at-a-glance triage', () => {
    const out = merchantNewOrderEmail(PLATFORM, data);
    expectWellFormed(out);
    expect(out.subject).toContain('#ABC12345');
    expect(out.subject).toContain('1,600 SYP');
  });

  it('carries the buyer contact details the merchant needs to call', () => {
    const out = merchantNewOrderEmail(PLATFORM, data);
    expect(out.text).toContain('سامر');
    expect(out.text).toContain('0999');
    expect(out.text).toContain('buyer@test.com');
  });

  it('omits the buyer email row for a guest who left none', () => {
    const out = merchantNewOrderEmail(PLATFORM, { ...data, buyerEmail: null });
    expect(out.text).not.toContain('البريد الإلكتروني');
  });

  it('links to the merchant order page, not the storefront one', () => {
    expect(merchantNewOrderEmail(PLATFORM, data).text).toContain(
      '/merchant/orders/o1',
    );
  });
});

describe('orderCancelledEmail', () => {
  const base = {
    orderReference: '#ABC12345',
    recipientName: 'سامر',
    storeName: 'متجر الشام',
    reason: 'تم الطلب بالخطأ',
    total: '1,600 SYP',
    orderUrl: 'https://app.test/o/1',
  };

  it('phrases the customer copy as "your order was cancelled"', () => {
    const out = orderCancelledEmail(STORE, { ...base, audience: 'customer' });
    expectWellFormed(out);
    expect(out.text).toContain('تم إلغاء طلبك');
    expect(out.text).toContain('استرداد المبلغ');
  });

  it('phrases the merchant copy as "the customer cancelled" and notes the restock', () => {
    const out = orderCancelledEmail(PLATFORM, {
      ...base,
      audience: 'merchant',
    });
    expectWellFormed(out);
    expect(out.text).toContain('ألغى العميل طلبه');
    expect(out.text).toContain('إعادة الكميات المحجوزة إلى المخزون');
  });

  it('always carries the reason and the order value', () => {
    for (const audience of ['customer', 'merchant'] as const) {
      const out = orderCancelledEmail(STORE, { ...base, audience });
      expect(out.text).toContain('تم الطلب بالخطأ');
      expect(out.text).toContain('1,600 SYP');
    }
  });

  it('includes the optional note when the customer left one', () => {
    const out = orderCancelledEmail(STORE, {
      ...base,
      audience: 'customer',
      note: 'غيرت رأيي',
    });
    expect(out.text).toContain('غيرت رأيي');
  });
});

describe('returnStatusEmail', () => {
  const base = {
    returnReference: '#RET12345',
    orderReference: '#ABC12345',
    customerName: 'سامر',
    storeName: 'متجر الشام',
    orderUrl: 'https://app.test/o/1',
  };

  it.each([
    ['REQUESTED', 'تم استلام الطلب'],
    ['UNDER_REVIEW', 'قيد المراجعة'],
    ['APPROVED', 'تمت الموافقة'],
    ['REJECTED', 'مرفوض'],
    ['AWAITING_PRODUCT', 'بانتظار المنتج'],
    ['PRODUCT_RECEIVED', 'تم استلام المنتج'],
    ['INSPECTING', 'قيد الفحص'],
    ['REFUND_PENDING', 'بانتظار الاسترداد'],
    ['REFUNDED', 'تم الاسترداد'],
    ['COMPLETED', 'مكتمل'],
  ])('covers the %s return status', (status, label) => {
    const out = returnStatusEmail(STORE, { ...base, status });
    expectWellFormed(out);
    expect(out.subject).toContain(label);
  });

  it('degrades gracefully for an unmapped status', () => {
    const out = returnStatusEmail(STORE, { ...base, status: 'WEIRD' });
    expect(out.text).toContain('تم تحديث حالة طلب الإرجاع');
  });

  it('references both the return and the original order', () => {
    const out = returnStatusEmail(STORE, { ...base, status: 'APPROVED' });
    expect(out.text).toContain('#RET12345');
    expect(out.text).toContain('#ABC12345');
  });
});

describe('refundIssuedEmail', () => {
  const data = {
    orderReference: '#ABC12345',
    customerName: 'سامر',
    storeName: 'متجر الشام',
    amount: '500 SYP',
    methodLabel: 'نقداً',
    orderUrl: 'https://app.test/o/1',
  };

  it('states the amount and the refund method', () => {
    const out = refundIssuedEmail(STORE, data);
    expectWellFormed(out);
    expect(out.text).toContain('500 SYP');
    expect(out.text).toContain('نقداً');
  });

  it('sets expectations that the money may take time to arrive', () => {
    expect(refundIssuedEmail(STORE, data).text).toContain('بعض الوقت');
  });

  it('includes the reason only when one is given', () => {
    expect(refundIssuedEmail(STORE, data).text).not.toContain('السبب');
    expect(
      refundIssuedEmail(STORE, { ...data, reason: 'منتج تالف' }).text,
    ).toContain('منتج تالف');
  });
});

// ---------------------------------------------------------------------------
// Subscription templates
// ---------------------------------------------------------------------------

describe('subscription templates', () => {
  const data: SubscriptionEmailData = {
    merchantName: 'حسام',
    storeName: 'متجر الشام',
    planName: 'احترافي',
    billingCycleLabel: 'شهرية',
    amount: '50 USD',
    startsAt: '١ آب ٢٠٢٦',
    expiresAt: '١ أيلول ٢٠٢٦',
    dashboardUrl: 'https://app.test/merchant/settings',
  };

  const cases = [
    ['renewed', subscriptionRenewedEmail, 'تم تجديد اشتراكك'],
    ['plan changed', subscriptionPlanChangedEmail, 'تم تغيير باقة اشتراكك'],
    ['suspended', subscriptionSuspendedEmail, 'تم إيقاف اشتراكك مؤقتاً'],
    ['cancelled', subscriptionCancelledEmail, 'تم إلغاء اشتراكك'],
    [
      'payment received',
      subscriptionPaymentReceivedEmail,
      'تم تأكيد استلام الدفعة',
    ],
  ] as const;

  it.each(cases)(
    '%s renders with the store, plan and dates',
    (_n, fn, title) => {
      const out = fn(PLATFORM, data);
      expectWellFormed(out);
      expect(out.text).toContain(title);
      expect(out.text).toContain('متجر الشام');
      expect(out.text).toContain('احترافي');
      expect(out.text).toContain('١ أيلول ٢٠٢٦');
    },
  );

  it.each(cases)('%s always links back to the dashboard', (_n, fn) => {
    expect(fn(PLATFORM, data).text).toContain(
      'https://app.test/merchant/settings',
    );
  });

  it.each(cases)('%s tolerates missing optional fields', (_n, fn) => {
    const out = fn(PLATFORM, {
      merchantName: 'حسام',
      storeName: 'متجر الشام',
      planName: 'احترافي',
      dashboardUrl: 'https://app.test',
    });
    expectWellFormed(out);
  });

  it('shows the previous plan on a package change, so the merchant sees what moved', () => {
    const out = subscriptionPlanChangedEmail(PLATFORM, {
      ...data,
      previousPlanName: 'أساسي',
    });
    expect(out.text).toContain('الباقة السابقة: أساسي');
  });

  it.each([
    ['suspension', subscriptionSuspendedEmail],
    ['cancellation', subscriptionCancelledEmail],
  ] as const)('surfaces the admin reason on %s', (_n, fn) => {
    const out = fn(PLATFORM, { ...data, reason: 'عدم السداد' });
    expect(out.text).toContain('عدم السداد');
  });

  it('warns that entitlements change when the plan changes', () => {
    expect(subscriptionPlanChangedEmail(PLATFORM, data).text).toContain(
      'قد تتغير المزايا المتاحة',
    );
  });
});

// ---------------------------------------------------------------------------
// Store-application templates (pre-existing, moved onto the shared layout)
// ---------------------------------------------------------------------------

describe('store application templates', () => {
  const data = {
    merchantName: 'حسام',
    storeName: 'متجر الشام',
    applicationReference: 'ABC12345',
    statusPageUrl: 'https://app.test/merchant/application-status',
  };

  it('renders the Arabic receipt with the reference and awaiting-review status', () => {
    const out = receiptEmailAr(data);
    expectWellFormed(out);
    expect(out.text).toContain('ABC12345');
    expect(out.text).toContain('بانتظار المراجعة');
    expect(out.html).toContain('dir="rtl"');
  });

  it('renders the English receipt with equivalent content', () => {
    const out = receiptEmailEn(data);
    expectWellFormed(out);
    expect(out.subject).toBe('Your store application has been received');
    expect(out.text).toContain('ABC12345');
    expect(out.text).toContain('Awaiting Review');
  });

  it.each([
    ['UNDER_REVIEW', 'قيد المراجعة'],
    ['CHANGES_REQUESTED', 'مطلوب تعديلات'],
    ['APPROVED', 'تمت الموافقة'],
    ['REJECTED', 'مرفوض'],
    ['SUSPENDED', 'موقوف'],
  ])('renders the Arabic %s status change', (status, label) => {
    const out = statusChangeEmail('ar', status, data);
    expectWellFormed(out);
    expect(out.text).toContain(label);
  });

  it.each([
    ['UNDER_REVIEW', 'Under review'],
    ['CHANGES_REQUESTED', 'Changes requested'],
    ['APPROVED', 'Approved'],
    ['REJECTED', 'Rejected'],
    ['SUSPENDED', 'Suspended'],
  ])('renders the English %s status change', (status, label) => {
    const out = statusChangeEmail('en', status, data);
    expectWellFormed(out);
    expect(out.text).toContain(label);
  });

  it.each(['ar', 'en'] as const)(
    'degrades gracefully in %s for an unmapped status',
    (lang) => {
      const out = statusChangeEmail(lang, 'WEIRD', data);
      expectWellFormed(out);
      expect(out.text).toContain('WEIRD');
    },
  );

  it('always links to the application status page', () => {
    for (const out of [
      receiptEmailAr(data),
      receiptEmailEn(data),
      statusChangeEmail('ar', 'APPROVED', data),
    ]) {
      expect(out.text).toContain(data.statusPageUrl);
    }
  });

  it('is branded as the platform, since applications are a platform concern', () => {
    expect(receiptEmailAr(data).text).toContain('TRENDWA');
  });
});
