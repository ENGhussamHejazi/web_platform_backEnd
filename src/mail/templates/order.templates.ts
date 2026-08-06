import { EmailBrand, EmailContent, RenderedEmail, renderEmail } from './layout';

export interface OrderEmailItem {
  name: string;
  quantity: string;
  lineTotal: string;
}

export interface OrderEmailData {
  orderReference: string;
  customerName: string;
  storeName: string;
  placedAt: string;
  items: OrderEmailItem[];
  subtotal: string;
  shippingCost: string;
  discount?: string;
  total: string;
  paymentMethodLabel: string;
  fulfillmentLabel: string;
  shippingAddress?: string;
  orderUrl: string;
}

const ITEMS_HEAD = ['المنتج', 'الكمية', 'الإجمالي'];

function itemsTable(items: OrderEmailItem[]): EmailContent['table'] {
  return {
    head: ITEMS_HEAD,
    rows: items.map((i) => [i.name, i.quantity, i.lineTotal]),
    numericColumns: [1, 2],
  };
}

function totalsRows(data: OrderEmailData) {
  return [
    { label: 'المجموع الفرعي', value: data.subtotal },
    { label: 'تكلفة الشحن', value: data.shippingCost },
    ...(data.discount ? [{ label: 'الخصم', value: data.discount }] : []),
    { label: 'الإجمالي', value: data.total, emphasis: true },
  ];
}

/** Sent to the buyer the moment the order is accepted by the server. */
export function orderConfirmationEmail(
  brand: EmailBrand,
  data: OrderEmailData,
): RenderedEmail {
  return renderEmail(brand, `تأكيد طلبك رقم ${data.orderReference}`, {
    preheader: `استلمنا طلبك من متجر ${data.storeName}`,
    title: 'تم استلام طلبك بنجاح',
    badge: { label: 'قيد المراجعة', tone: 'info' },
    paragraphs: [
      `مرحباً ${data.customerName}، شكراً لطلبك من متجر ${data.storeName}.`,
      `رقم الطلب: ${data.orderReference} — تاريخ الطلب: ${data.placedAt}`,
      'سيقوم المتجر بمراجعة طلبك وتأكيده قريباً، وسنرسل لك رسالة عند كل تحديث على حالة الطلب.',
    ],
    table: itemsTable(data.items),
    rows: [
      ...totalsRows(data),
      { label: 'طريقة الدفع', value: data.paymentMethodLabel },
      { label: 'طريقة الاستلام', value: data.fulfillmentLabel },
      ...(data.shippingAddress
        ? [{ label: 'عنوان التوصيل', value: data.shippingAddress }]
        : []),
    ],
    button: { label: 'تتبّع الطلب', url: data.orderUrl },
    footnote: 'احتفظ برقم الطلب للرجوع إليه عند التواصل مع المتجر.',
  });
}

const STATUS_COPY: Record<
  string,
  {
    label: string;
    tone: 'info' | 'success' | 'warning' | 'danger';
    message: string;
  }
> = {
  PENDING: {
    label: 'قيد المراجعة',
    tone: 'info',
    message: 'طلبك بانتظار المراجعة من المتجر.',
  },
  CONFIRMED: {
    label: 'تم التأكيد',
    tone: 'info',
    message: 'تم تأكيد طلبك من المتجر وسيتم تجهيزه قريباً.',
  },
  PROCESSING: {
    label: 'قيد التجهيز',
    tone: 'info',
    message: 'جارٍ تجهيز طلبك الآن استعداداً للشحن.',
  },
  SHIPPED: {
    label: 'تم الشحن',
    tone: 'info',
    message: 'تم شحن طلبك وهو في طريقه إليك.',
  },
  OUT_FOR_DELIVERY: {
    label: 'قيد التوصيل',
    tone: 'warning',
    message: 'طلبك مع مندوب التوصيل الآن — يرجى التأكد من إمكانية الوصول إليك.',
  },
  DELIVERED: {
    label: 'تم التوصيل',
    tone: 'success',
    message: 'تم توصيل طلبك بنجاح. نتمنى أن ينال إعجابك!',
  },
  CANCELLED: {
    label: 'تم الإلغاء',
    tone: 'danger',
    message: 'تم إلغاء طلبك.',
  },
};

export interface OrderStatusEmailData {
  orderReference: string;
  customerName: string;
  storeName: string;
  status: string;
  /** Cancellation reason / merchant note, when there is one. */
  note?: string | null;
  trackingNumber?: string | null;
  driverName?: string | null;
  driverPhone?: string | null;
  estimatedDelivery?: string | null;
  orderUrl: string;
}

export function orderStatusUpdateEmail(
  brand: EmailBrand,
  data: OrderStatusEmailData,
): RenderedEmail {
  const copy = STATUS_COPY[data.status] ?? {
    label: data.status,
    tone: 'info' as const,
    message: 'تم تحديث حالة طلبك.',
  };
  const isDelivered = data.status === 'DELIVERED';

  return renderEmail(
    brand,
    `تحديث طلبك ${data.orderReference}: ${copy.label}`,
    {
      preheader: `${copy.label} — طلبك من متجر ${data.storeName}`,
      title: `حالة طلبك: ${copy.label}`,
      badge: { label: copy.label, tone: copy.tone },
      paragraphs: [
        `مرحباً ${data.customerName},`,
        copy.message,
        ...(data.note ? [`ملاحظة من المتجر: ${data.note}`] : []),
      ],
      rows: [
        { label: 'رقم الطلب', value: data.orderReference },
        { label: 'الحالة الحالية', value: copy.label, emphasis: true },
        ...(data.trackingNumber
          ? [{ label: 'رقم التتبّع', value: data.trackingNumber }]
          : []),
        ...(data.driverName
          ? [{ label: 'مندوب التوصيل', value: data.driverName }]
          : []),
        ...(data.driverPhone
          ? [{ label: 'هاتف المندوب', value: data.driverPhone }]
          : []),
        ...(data.estimatedDelivery
          ? [{ label: 'موعد التوصيل المتوقع', value: data.estimatedDelivery }]
          : []),
      ],
      button: {
        label: isDelivered ? 'قيّم منتجاتك' : 'تتبّع الطلب',
        url: data.orderUrl,
      },
      footnote: isDelivered
        ? 'رأيك يهمنا — يمكنك تقييم المنتجات التي اشتريتها من صفحة الطلب.'
        : undefined,
    },
  );
}

export interface MerchantNewOrderData {
  orderReference: string;
  storeName: string;
  buyerName: string;
  buyerPhone: string;
  buyerEmail?: string | null;
  placedAt: string;
  itemCount: number;
  total: string;
  paymentMethodLabel: string;
  fulfillmentLabel: string;
  governorate?: string | null;
  orderUrl: string;
}

/** Sent to the store owner so a new order isn't missed if the dashboard is closed. */
export function merchantNewOrderEmail(
  brand: EmailBrand,
  data: MerchantNewOrderData,
): RenderedEmail {
  return renderEmail(brand, `طلب جديد ${data.orderReference} — ${data.total}`, {
    preheader: `طلب جديد من ${data.buyerName} في متجر ${data.storeName}`,
    title: 'وصلك طلب جديد',
    badge: { label: 'طلب جديد', tone: 'success' },
    paragraphs: [
      `تم استلام طلب جديد في متجر ${data.storeName} بتاريخ ${data.placedAt}.`,
      'يرجى مراجعة الطلب وتأكيده من لوحة التحكم في أقرب وقت.',
    ],
    rows: [
      { label: 'رقم الطلب', value: data.orderReference },
      { label: 'العميل', value: data.buyerName },
      { label: 'رقم الهاتف', value: data.buyerPhone },
      ...(data.buyerEmail
        ? [{ label: 'البريد الإلكتروني', value: data.buyerEmail }]
        : []),
      { label: 'عدد الأصناف', value: String(data.itemCount) },
      { label: 'طريقة الدفع', value: data.paymentMethodLabel },
      { label: 'طريقة الاستلام', value: data.fulfillmentLabel },
      ...(data.governorate
        ? [{ label: 'المحافظة', value: data.governorate }]
        : []),
      { label: 'إجمالي الطلب', value: data.total, emphasis: true },
    ],
    button: { label: 'فتح الطلب', url: data.orderUrl },
  });
}

export interface OrderCancelledData {
  orderReference: string;
  recipientName: string;
  storeName: string;
  reason: string;
  note?: string | null;
  total: string;
  orderUrl: string;
  /** Merchant copy phrases it as "the customer cancelled", customer copy as "your order was cancelled". */
  audience: 'customer' | 'merchant';
}

export function orderCancelledEmail(
  brand: EmailBrand,
  data: OrderCancelledData,
): RenderedEmail {
  const isMerchant = data.audience === 'merchant';
  return renderEmail(
    brand,
    isMerchant
      ? `إلغاء الطلب ${data.orderReference} من قبل العميل`
      : `تم إلغاء طلبك ${data.orderReference}`,
    {
      preheader: isMerchant
        ? `قام العميل بإلغاء الطلب ${data.orderReference}`
        : `تم إلغاء طلبك من متجر ${data.storeName}`,
      title: isMerchant ? 'ألغى العميل طلبه' : 'تم إلغاء طلبك',
      badge: { label: 'ملغى', tone: 'danger' },
      paragraphs: isMerchant
        ? [
            `قام العميل بإلغاء الطلب ${data.orderReference} في متجر ${data.storeName}.`,
            'تمت إعادة الكميات المحجوزة إلى المخزون تلقائياً.',
          ]
        : [
            `مرحباً ${data.recipientName}، تم إلغاء طلبك ${data.orderReference} من متجر ${data.storeName}.`,
            'إذا كنت قد دفعت قيمة الطلب مسبقاً، سيتواصل معك المتجر بخصوص استرداد المبلغ.',
          ],
      rows: [
        { label: 'رقم الطلب', value: data.orderReference },
        { label: 'سبب الإلغاء', value: data.reason },
        ...(data.note ? [{ label: 'ملاحظة', value: data.note }] : []),
        { label: 'قيمة الطلب', value: data.total, emphasis: true },
      ],
      button: { label: 'عرض تفاصيل الطلب', url: data.orderUrl },
    },
  );
}

const RETURN_STATUS_COPY: Record<
  string,
  {
    label: string;
    tone: 'info' | 'success' | 'warning' | 'danger';
    message: string;
  }
> = {
  REQUESTED: {
    label: 'تم استلام الطلب',
    tone: 'info',
    message: 'استلمنا طلب الإرجاع الخاص بك وهو بانتظار المراجعة.',
  },
  UNDER_REVIEW: {
    label: 'قيد المراجعة',
    tone: 'info',
    message: 'يقوم المتجر بمراجعة طلب الإرجاع الخاص بك.',
  },
  APPROVED: {
    label: 'تمت الموافقة',
    tone: 'success',
    message:
      'تمت الموافقة على طلب الإرجاع. يرجى اتباع تعليمات المتجر لإرسال المنتج.',
  },
  REJECTED: {
    label: 'مرفوض',
    tone: 'danger',
    message: 'نأسف، تم رفض طلب الإرجاع الخاص بك.',
  },
  AWAITING_PRODUCT: {
    label: 'بانتظار المنتج',
    tone: 'warning',
    message: 'المتجر بانتظار استلام المنتج المُرجَع منك.',
  },
  PRODUCT_RECEIVED: {
    label: 'تم استلام المنتج',
    tone: 'info',
    message: 'استلم المتجر المنتج المُرجَع وسيتم فحصه.',
  },
  INSPECTING: {
    label: 'قيد الفحص',
    tone: 'info',
    message: 'جارٍ فحص المنتج المُرجَع.',
  },
  REFUND_PENDING: {
    label: 'بانتظار الاسترداد',
    tone: 'warning',
    message: 'تمت الموافقة على الاسترداد وسيتم تنفيذه قريباً.',
  },
  REFUNDED: {
    label: 'تم الاسترداد',
    tone: 'success',
    message: 'تم استرداد المبلغ الخاص بطلب الإرجاع.',
  },
  COMPLETED: {
    label: 'مكتمل',
    tone: 'success',
    message: 'تم إغلاق طلب الإرجاع بنجاح.',
  },
};

export interface ReturnStatusEmailData {
  returnReference: string;
  orderReference: string;
  customerName: string;
  storeName: string;
  status: string;
  note?: string | null;
  orderUrl: string;
}

export function returnStatusEmail(
  brand: EmailBrand,
  data: ReturnStatusEmailData,
): RenderedEmail {
  const copy = RETURN_STATUS_COPY[data.status] ?? {
    label: data.status,
    tone: 'info' as const,
    message: 'تم تحديث حالة طلب الإرجاع.',
  };
  return renderEmail(
    brand,
    `تحديث طلب الإرجاع ${data.returnReference}: ${copy.label}`,
    {
      preheader: `${copy.label} — طلب إرجاع من متجر ${data.storeName}`,
      title: `حالة طلب الإرجاع: ${copy.label}`,
      badge: { label: copy.label, tone: copy.tone },
      paragraphs: [
        `مرحباً ${data.customerName},`,
        copy.message,
        ...(data.note ? [`ملاحظة من المتجر: ${data.note}`] : []),
      ],
      rows: [
        { label: 'رقم طلب الإرجاع', value: data.returnReference },
        { label: 'رقم الطلب الأصلي', value: data.orderReference },
        { label: 'الحالة', value: copy.label, emphasis: true },
      ],
      button: { label: 'عرض الطلب', url: data.orderUrl },
    },
  );
}

export interface RefundEmailData {
  orderReference: string;
  customerName: string;
  storeName: string;
  amount: string;
  methodLabel: string;
  reason?: string | null;
  orderUrl: string;
}

export function refundIssuedEmail(
  brand: EmailBrand,
  data: RefundEmailData,
): RenderedEmail {
  return renderEmail(brand, `تم تنفيذ استرداد للطلب ${data.orderReference}`, {
    preheader: `استرداد بقيمة ${data.amount} من متجر ${data.storeName}`,
    title: 'تم تنفيذ عملية استرداد',
    badge: { label: 'استرداد', tone: 'success' },
    paragraphs: [
      `مرحباً ${data.customerName}، قام متجر ${data.storeName} بتنفيذ عملية استرداد على طلبك.`,
      'قد يستغرق وصول المبلغ بعض الوقت حسب طريقة الاسترداد المستخدمة.',
    ],
    rows: [
      { label: 'رقم الطلب', value: data.orderReference },
      { label: 'طريقة الاسترداد', value: data.methodLabel },
      ...(data.reason ? [{ label: 'السبب', value: data.reason }] : []),
      { label: 'المبلغ المسترد', value: data.amount, emphasis: true },
    ],
    button: { label: 'عرض تفاصيل الطلب', url: data.orderUrl },
  });
}
