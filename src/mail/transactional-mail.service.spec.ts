import { TransactionalMailService } from './transactional-mail.service';
import { EmailEvent } from './email-events';
import type { EnqueueEmailInput } from './email-queue.service';

const BASE_URL = 'http://localhost:5173';

const store = {
  id: 'store-1',
  name: 'متجر الشام',
  slug: 'sham',
  logoUrl: null as string | null,
  primaryColor: '#7C3AED',
  currency: 'SYP',
  owner: { id: 'owner-1', name: 'حسام', email: 'owner@example.com' },
};

const ORDER_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

function buildOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: ORDER_ID,
    customerId: null,
    guestName: 'سامر',
    guestEmail: 'buyer@example.com',
    guestPhone: '0999',
    subtotal: 1000,
    shippingCost: 100,
    loyaltyDiscount: 0,
    total: 1100,
    shippingAddress: 'دمشق - المزة',
    governorate: 'DAMASCUS',
    fulfillmentType: 'DELIVERY',
    paymentMethod: 'CASH_ON_DELIVERY',
    trackingNumber: null,
    driverName: null,
    driverPhone: null,
    estimatedDeliveryAt: null,
    createdAt: new Date('2026-08-01T10:00:00Z'),
    customer: null,
    items: [
      {
        productName: 'زيت زيتون',
        variantLabel: null,
        quantity: 2,
        price: 500,
        parentOrderItemId: null,
      },
      // A box's chosen contents: a child row that must not be listed on its own.
      {
        productName: 'صابون',
        variantLabel: null,
        quantity: 1,
        price: 0,
        parentOrderItemId: 'parent-1',
      },
    ],
    store,
    ...overrides,
  };
}

describe('TransactionalMailService', () => {
  const enqueue = jest.fn();
  const config = {
    get: jest.fn((key: string) =>
      key === 'frontendBaseUrl' ? BASE_URL : undefined,
    ),
  };
  const prisma = {
    order: { findUnique: jest.fn() },
    user: { findMany: jest.fn() },
    store: { findUnique: jest.fn() },
  };

  let service: TransactionalMailService;

  /** All payloads enqueued in the current test, in order. */
  const sent = (): EnqueueEmailInput[] =>
    (enqueue.mock.calls as EnqueueEmailInput[][]).map((c) => c[0]);
  const sentOfType = (type: string) => sent().filter((p) => p.type === type);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.order.findUnique.mockResolvedValue(buildOrder());
    service = new TransactionalMailService(
      prisma as never,
      { enqueue } as never,
      config as never,
      // This suite asserts template/branding output, not plan gating — grant
      // the feature so every event reaches the queue. The gate itself is
      // covered in transactional-mail.entitlement.spec.ts.
      { hasFeature: jest.fn().mockResolvedValue(true) } as never,
    );
  });

  // -------------------------------------------------------------------
  // Formatting helpers
  // -------------------------------------------------------------------

  describe('formatting helpers', () => {
    it('shortens a uuid into a readable order reference', () => {
      expect(service.reference(ORDER_ID)).toBe('#AAAAAAAA');
    });

    it('formats money with thousands separators and the store currency', () => {
      expect(service.money(1234567.5, 'SYP')).toBe('1,234,567.5 SYP');
    });

    it('defaults to SYP when no currency is given', () => {
      expect(service.money(10)).toBe('10 SYP');
    });

    it('treats a missing amount as zero rather than rendering NaN', () => {
      expect(service.money(null)).toBe('0 SYP');
      expect(service.money(undefined)).toBe('0 SYP');
    });

    it('formats dates in Arabic', () => {
      expect(service.date(new Date('2026-08-01T10:00:00Z'))).toContain('٢٠٢٦');
    });

    it('accepts an ISO string as well as a Date', () => {
      expect(service.date('2026-08-01T10:00:00Z')).toBe(
        service.date(new Date('2026-08-01T10:00:00Z')),
      );
    });

    it('renders an empty string for a missing date instead of "Invalid Date"', () => {
      expect(service.date(null)).toBe('');
      expect(service.date(undefined)).toBe('');
    });
  });

  // -------------------------------------------------------------------
  // Branding
  // -------------------------------------------------------------------

  describe('branding', () => {
    it('brands storefront emails with the store colour', async () => {
      await service.sendOrderPlaced(ORDER_ID);
      expect(sentOfType(EmailEvent.ORDER_CONFIRMATION)[0].html).toContain(
        '#7C3AED',
      );
    });

    it('brands merchant-facing emails as TRENDWA, not as the store', async () => {
      await service.sendOrderPlaced(ORDER_ID);
      const merchant = sentOfType(EmailEvent.MERCHANT_NEW_ORDER)[0];
      expect(merchant.html).toContain('TRENDWA');
      expect(merchant.html).not.toContain('#7C3AED');
    });

    it('absolutises a relative logo path, which an inbox cannot resolve', async () => {
      prisma.order.findUnique.mockResolvedValue(
        buildOrder({ store: { ...store, logoUrl: '/uploads/logo.png' } }),
      );
      await service.sendOrderPlaced(ORDER_ID);
      expect(sentOfType(EmailEvent.ORDER_CONFIRMATION)[0].html).toContain(
        `${BASE_URL}/uploads/logo.png`,
      );
    });

    it('leaves an already-absolute logo url alone', async () => {
      prisma.order.findUnique.mockResolvedValue(
        buildOrder({
          store: { ...store, logoUrl: 'https://cdn.test/logo.png' },
        }),
      );
      await service.sendOrderPlaced(ORDER_ID);
      const html = sentOfType(EmailEvent.ORDER_CONFIRMATION)[0].html;
      expect(html).toContain('https://cdn.test/logo.png');
      expect(html).not.toContain(`${BASE_URL}https://`);
    });

    it('falls back to the default accent when the store has no colour set', async () => {
      prisma.order.findUnique.mockResolvedValue(
        buildOrder({ store: { ...store, primaryColor: null } }),
      );
      await service.sendOrderPlaced(ORDER_ID);
      expect(sentOfType(EmailEvent.ORDER_CONFIRMATION)[0].html).toContain(
        '#0EA5A4',
      );
    });
  });

  // -------------------------------------------------------------------
  // Account events
  // -------------------------------------------------------------------

  describe('sendMerchantWelcome', () => {
    const params = {
      userId: 'user-1',
      email: 'm@example.com',
      merchantName: 'حسام',
      storeId: 'store-1',
      storeName: 'متجر الشام',
      planName: 'احترافي',
      billingCycle: 'MONTHLY' as const,
    };

    it('queues one email scoped to the new user and store', async () => {
      await service.sendMerchantWelcome(params);
      expect(enqueue).toHaveBeenCalledTimes(1);
      expect(sent()[0]).toEqual(
        expect.objectContaining({
          type: EmailEvent.MERCHANT_WELCOME,
          idempotencyKey: `${EmailEvent.MERCHANT_WELCOME}:user-1`,
          recipientEmail: 'm@example.com',
          recipientUserId: 'user-1',
          storeId: 'store-1',
        }),
      );
    });

    it('points the merchant at the dashboard', async () => {
      await service.sendMerchantWelcome(params);
      expect(sent()[0].text).toContain(`${BASE_URL}/merchant`);
    });

    it('sends nothing when the account has no email address', async () => {
      await service.sendMerchantWelcome({ ...params, email: '' });
      expect(enqueue).not.toHaveBeenCalled();
    });
  });

  describe('sendAdminNewMerchant', () => {
    const params = {
      storeId: 'store-1',
      storeName: 'متجر الشام',
      merchantName: 'حسام',
      merchantEmail: 'm@example.com',
      merchantPhone: '0999',
      planName: 'Professional',
    };

    it('fans out to every super admin with a per-admin idempotency key', async () => {
      prisma.user.findMany.mockResolvedValue([
        { id: 'admin-1', email: 'a1@example.com' },
        { id: 'admin-2', email: 'a2@example.com' },
      ]);

      await service.sendAdminNewMerchant(params);

      expect(sent().map((p) => p.idempotencyKey)).toEqual([
        `${EmailEvent.ADMIN_NEW_MERCHANT}:store-1:admin-1`,
        `${EmailEvent.ADMIN_NEW_MERCHANT}:store-1:admin-2`,
      ]);
    });

    it('only queries super admins, never other roles', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      await service.sendAdminNewMerchant(params);
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { role: 'SUPER_ADMIN' } }),
      );
    });

    it('is a no-op when no super admin exists', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      await service.sendAdminNewMerchant(params);
      expect(enqueue).not.toHaveBeenCalled();
    });
  });

  describe('sendCustomerWelcome', () => {
    const params = {
      userId: 'cust-1',
      email: 'c@example.com',
      customerName: 'سامر',
      store,
    };

    it('is branded as the store and links to the storefront', async () => {
      await service.sendCustomerWelcome(params);
      const payload = sent()[0];
      expect(payload.type).toBe(EmailEvent.CUSTOMER_WELCOME);
      expect(payload.storeId).toBe('store-1');
      expect(payload.html).toContain('#7C3AED');
      expect(payload.text).toContain(`${BASE_URL}/store/sham`);
    });

    it('url-encodes a slug that needs it', async () => {
      await service.sendCustomerWelcome({
        ...params,
        store: { ...store, slug: 'a b' },
      });
      expect(sent()[0].text).toContain('/store/a%20b');
    });
  });

  describe('sendPasswordReset', () => {
    const params = {
      userId: 'user-1',
      email: 'u@example.com',
      resetUrl: 'https://app.test/reset?token=abc',
      tokenHash: 'hash-1',
    };

    it('keys idempotency on the token hash, so each new request sends again', async () => {
      await service.sendPasswordReset(params);
      await service.sendPasswordReset({ ...params, tokenHash: 'hash-2' });
      expect(sent().map((p) => p.idempotencyKey)).toEqual([
        `${EmailEvent.PASSWORD_RESET}:user-1:hash-1`,
        `${EmailEvent.PASSWORD_RESET}:user-1:hash-2`,
      ]);
    });

    it('uses the platform brand for a merchant or admin account', async () => {
      await service.sendPasswordReset(params);
      expect(sent()[0].html).toContain('TRENDWA');
      expect(sent()[0].storeId).toBeUndefined();
    });

    it('uses the store brand for a storefront customer', async () => {
      await service.sendPasswordReset({ ...params, store });
      expect(sent()[0].html).toContain('متجر الشام');
      expect(sent()[0].storeId).toBe('store-1');
    });

    it('carries the reset link through untouched', async () => {
      await service.sendPasswordReset(params);
      expect(sent()[0].text).toContain('https://app.test/reset?token=abc');
    });
  });

  // -------------------------------------------------------------------
  // Order events
  // -------------------------------------------------------------------

  describe('sendOrderPlaced', () => {
    it('emails both the buyer and the store owner', async () => {
      await service.sendOrderPlaced(ORDER_ID);

      expect(enqueue).toHaveBeenCalledTimes(2);
      const [buyer, merchant] = sent();

      expect(buyer.type).toBe(EmailEvent.ORDER_CONFIRMATION);
      expect(buyer.recipientEmail).toBe('buyer@example.com');
      expect(buyer.storeId).toBe('store-1');
      expect(buyer.orderId).toBe(ORDER_ID);

      expect(merchant.type).toBe(EmailEvent.MERCHANT_NEW_ORDER);
      expect(merchant.recipientEmail).toBe('owner@example.com');
      expect(merchant.recipientUserId).toBe('owner-1');
    });

    it('leaves recipientUserId unset for a guest order', async () => {
      await service.sendOrderPlaced(ORDER_ID);
      expect(sent()[0].recipientUserId).toBeUndefined();
    });

    it('links a logged-in customer order to their account and uses their details', async () => {
      prisma.order.findUnique.mockResolvedValue(
        buildOrder({
          customerId: 'cust-1',
          customer: {
            id: 'cust-1',
            name: 'ليلى',
            email: 'laila@example.com',
            phone: '0988',
          },
        }),
      );

      await service.sendOrderPlaced(ORDER_ID);
      const buyer = sent()[0];
      expect(buyer.recipientEmail).toBe('laila@example.com');
      expect(buyer.recipientUserId).toBe('cust-1');
      expect(buyer.text).toContain('ليلى');
    });

    it('lists only top-level lines, so box contents are not double-counted', async () => {
      await service.sendOrderPlaced(ORDER_ID);
      const buyer = sent()[0];
      expect(buyer.text).toContain('زيت زيتون');
      expect(buyer.text).not.toContain('صابون');
    });

    it('appends the variant label to the product name when there is one', async () => {
      prisma.order.findUnique.mockResolvedValue(
        buildOrder({
          items: [
            {
              productName: 'قميص',
              variantLabel: 'L / أحمر',
              quantity: 1,
              price: 100,
              parentOrderItemId: null,
            },
          ],
        }),
      );
      await service.sendOrderPlaced(ORDER_ID);
      expect(sent()[0].text).toContain('قميص — L / أحمر');
    });

    it('computes the line total as unit price × quantity', async () => {
      await service.sendOrderPlaced(ORDER_ID);
      expect(sent()[0].text).toContain('1,000 SYP');
    });

    it('counts only top-level lines in the merchant item count', async () => {
      await service.sendOrderPlaced(ORDER_ID);
      expect(sent()[1].text).toContain('عدد الأصناف: 1');
    });

    it('shows a loyalty discount when one was applied', async () => {
      prisma.order.findUnique.mockResolvedValue(
        buildOrder({ loyaltyDiscount: 200 }),
      );
      await service.sendOrderPlaced(ORDER_ID);
      expect(sent()[0].text).toContain('الخصم: - 200 SYP');
    });

    it('omits the discount row when nothing was discounted', async () => {
      await service.sendOrderPlaced(ORDER_ID);
      expect(sent()[0].text).not.toContain('الخصم');
    });

    it('labels a pickup order and omits the delivery address', async () => {
      prisma.order.findUnique.mockResolvedValue(
        buildOrder({ fulfillmentType: 'PICKUP' }),
      );
      await service.sendOrderPlaced(ORDER_ID);
      expect(sent()[0].text).toContain('استلام من المتجر');
      expect(sent()[0].text).not.toContain('عنوان التوصيل');
    });

    it.each([
      ['CASH_ON_DELIVERY', 'الدفع عند الاستلام'],
      ['CARD', 'بطاقة'],
      ['CRYPTO', 'عملة رقمية'],
    ])('localises the %s payment method', async (paymentMethod, label) => {
      prisma.order.findUnique.mockResolvedValue(buildOrder({ paymentMethod }));
      await service.sendOrderPlaced(ORDER_ID);
      expect(sent()[0].text).toContain(label);
    });

    it('falls back to the raw payment method if an unmapped one appears', async () => {
      prisma.order.findUnique.mockResolvedValue(
        buildOrder({ paymentMethod: 'FUTURE_METHOD' }),
      );
      await service.sendOrderPlaced(ORDER_ID);
      expect(sent()[0].text).toContain('FUTURE_METHOD');
    });

    it('still alerts the merchant when the buyer left no email', async () => {
      prisma.order.findUnique.mockResolvedValue(
        buildOrder({ guestEmail: null }),
      );
      await service.sendOrderPlaced(ORDER_ID);
      expect(enqueue).toHaveBeenCalledTimes(1);
      expect(sent()[0].type).toBe(EmailEvent.MERCHANT_NEW_ORDER);
    });

    it('sends nothing when the order no longer exists', async () => {
      prisma.order.findUnique.mockResolvedValue(null);
      await service.sendOrderPlaced(ORDER_ID);
      expect(enqueue).not.toHaveBeenCalled();
    });

    it('sends the buyer the customer order url and the merchant the dashboard url', async () => {
      await service.sendOrderPlaced(ORDER_ID);
      expect(sent()[0].text).toContain(
        `${BASE_URL}/store/sham/account/orders/${ORDER_ID}`,
      );
      expect(sent()[1].text).toContain(
        `${BASE_URL}/merchant/orders/${ORDER_ID}`,
      );
    });

    it('is idempotent per order', async () => {
      await service.sendOrderPlaced(ORDER_ID);
      expect(sent()[0].idempotencyKey).toBe(
        `${EmailEvent.ORDER_CONFIRMATION}:${ORDER_ID}`,
      );
      expect(sent()[1].idempotencyKey).toBe(
        `${EmailEvent.MERCHANT_NEW_ORDER}:${ORDER_ID}`,
      );
    });
  });

  describe('sendOrderStatusUpdate', () => {
    it.each([
      'CONFIRMED',
      'PROCESSING',
      'SHIPPED',
      'OUT_FOR_DELIVERY',
      'DELIVERED',
      'CANCELLED',
    ])('sends for %s', async (status) => {
      await service.sendOrderStatusUpdate(ORDER_ID, status);
      expect(enqueue).toHaveBeenCalledTimes(1);
      expect(sent()[0].type).toBe(EmailEvent.ORDER_STATUS_UPDATE);
    });

    it('keys idempotency by status so each stage sends exactly once', async () => {
      await service.sendOrderStatusUpdate(ORDER_ID, 'SHIPPED');
      expect(sent()[0].idempotencyKey).toBe(
        `${EmailEvent.ORDER_STATUS_UPDATE}:${ORDER_ID}:SHIPPED`,
      );
    });

    it('skips PENDING, which the confirmation email already covered', async () => {
      await service.sendOrderStatusUpdate(ORDER_ID, 'PENDING');
      expect(prisma.order.findUnique).not.toHaveBeenCalled();
      expect(enqueue).not.toHaveBeenCalled();
    });

    it('sends nothing when there is no buyer email to send to', async () => {
      prisma.order.findUnique.mockResolvedValue(
        buildOrder({ guestEmail: null }),
      );
      await service.sendOrderStatusUpdate(ORDER_ID, 'SHIPPED');
      expect(enqueue).not.toHaveBeenCalled();
    });

    it('passes the merchant note through, e.g. a cancellation reason', async () => {
      await service.sendOrderStatusUpdate(ORDER_ID, 'CANCELLED', 'نفد المخزون');
      expect(sent()[0].text).toContain('نفد المخزون');
    });

    it.each(['SHIPPED', 'OUT_FOR_DELIVERY'])(
      'includes driver contact details on %s',
      async (status) => {
        prisma.order.findUnique.mockResolvedValue(
          buildOrder({ driverName: 'أبو علي', driverPhone: '0988' }),
        );
        await service.sendOrderStatusUpdate(ORDER_ID, status);
        expect(sent()[0].text).toContain('أبو علي');
        expect(sent()[0].text).toContain('0988');
      },
    );

    it('withholds driver details on stages where they are not yet meaningful', async () => {
      prisma.order.findUnique.mockResolvedValue(
        buildOrder({ driverName: 'أبو علي', driverPhone: '0988' }),
      );
      await service.sendOrderStatusUpdate(ORDER_ID, 'CONFIRMED');
      expect(sent()[0].text).not.toContain('أبو علي');
    });

    it('includes the tracking number whenever the order has one', async () => {
      prisma.order.findUnique.mockResolvedValue(
        buildOrder({ trackingNumber: 'TRK-9' }),
      );
      await service.sendOrderStatusUpdate(ORDER_ID, 'SHIPPED');
      expect(sent()[0].text).toContain('TRK-9');
    });

    it('formats the estimated delivery date rather than dumping an ISO string', async () => {
      prisma.order.findUnique.mockResolvedValue(
        buildOrder({ estimatedDeliveryAt: new Date('2026-08-05T00:00:00Z') }),
      );
      await service.sendOrderStatusUpdate(ORDER_ID, 'SHIPPED');
      expect(sent()[0].text).not.toContain('2026-08-05T');
      expect(sent()[0].text).toContain('٢٠٢٦');
    });
  });

  describe('sendOrderCancelledByCustomer', () => {
    it('emails the customer and the merchant with audience-appropriate wording', async () => {
      await service.sendOrderCancelledByCustomer(ORDER_ID, 'تم الطلب بالخطأ');

      expect(enqueue).toHaveBeenCalledTimes(2);
      const [customer, merchant] = sent();

      expect(customer.type).toBe(EmailEvent.ORDER_CANCELLED_BY_CUSTOMER);
      expect(customer.recipientEmail).toBe('buyer@example.com');
      expect(customer.text).toContain('تم إلغاء طلبك');

      expect(merchant.type).toBe(EmailEvent.MERCHANT_ORDER_CANCELLED);
      expect(merchant.recipientEmail).toBe('owner@example.com');
      expect(merchant.text).toContain('ألغى العميل طلبه');
    });

    it('still notifies the merchant when the buyer has no email', async () => {
      prisma.order.findUnique.mockResolvedValue(
        buildOrder({ guestEmail: null }),
      );
      await service.sendOrderCancelledByCustomer(ORDER_ID, 'سبب');
      expect(enqueue).toHaveBeenCalledTimes(1);
      expect(sent()[0].type).toBe(EmailEvent.MERCHANT_ORDER_CANCELLED);
    });

    it('includes the reason and the optional note in both copies', async () => {
      await service.sendOrderCancelledByCustomer(
        ORDER_ID,
        'تم الطلب بالخطأ',
        'غيرت رأيي',
      );
      for (const payload of sent()) {
        expect(payload.text).toContain('تم الطلب بالخطأ');
        expect(payload.text).toContain('غيرت رأيي');
      }
    });

    it('scopes both emails to the order for auditing', async () => {
      await service.sendOrderCancelledByCustomer(ORDER_ID, 'سبب');
      for (const payload of sent()) {
        expect(payload.orderId).toBe(ORDER_ID);
        expect(payload.storeId).toBe('store-1');
      }
    });
  });

  describe('sendReturnStatusUpdate', () => {
    const params = {
      returnId: 'ffffffff-1111-2222-3333-444444444444',
      orderId: ORDER_ID,
      status: 'APPROVED',
    };

    it('emails the customer with both references', async () => {
      await service.sendReturnStatusUpdate(params);
      const payload = sent()[0];
      expect(payload.type).toBe(EmailEvent.RETURN_STATUS_UPDATE);
      expect(payload.text).toContain('#FFFFFFFF');
      expect(payload.text).toContain(service.reference(ORDER_ID));
    });

    it('keys idempotency by return and status', async () => {
      await service.sendReturnStatusUpdate(params);
      expect(sent()[0].idempotencyKey).toBe(
        `${EmailEvent.RETURN_STATUS_UPDATE}:${params.returnId}:APPROVED`,
      );
    });

    it('sends nothing when there is no customer email', async () => {
      prisma.order.findUnique.mockResolvedValue(
        buildOrder({ guestEmail: null }),
      );
      await service.sendReturnStatusUpdate(params);
      expect(enqueue).not.toHaveBeenCalled();
    });

    it('relays the merchant note when present', async () => {
      await service.sendReturnStatusUpdate({ ...params, note: 'أرسل المنتج' });
      expect(sent()[0].text).toContain('أرسل المنتج');
    });
  });

  describe('sendRefundIssued', () => {
    const params = {
      refundId: 'refund-1',
      orderId: ORDER_ID,
      amount: 500,
      methodLabel: 'نقداً',
    };

    it('emails the customer the amount in the store currency', async () => {
      await service.sendRefundIssued(params);
      const payload = sent()[0];
      expect(payload.type).toBe(EmailEvent.REFUND_ISSUED);
      expect(payload.text).toContain('500 SYP');
      expect(payload.text).toContain('نقداً');
    });

    it('is idempotent per refund, so two refunds on one order both send', async () => {
      await service.sendRefundIssued(params);
      await service.sendRefundIssued({ ...params, refundId: 'refund-2' });
      expect(sent().map((p) => p.idempotencyKey)).toEqual([
        `${EmailEvent.REFUND_ISSUED}:refund-1`,
        `${EmailEvent.REFUND_ISSUED}:refund-2`,
      ]);
    });

    it('sends nothing when there is no customer email', async () => {
      prisma.order.findUnique.mockResolvedValue(
        buildOrder({ guestEmail: null }),
      );
      await service.sendRefundIssued(params);
      expect(enqueue).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------
  // Subscription events
  // -------------------------------------------------------------------

  describe('sendSubscriptionEvent', () => {
    const subscriptionStore = {
      id: 'store-1',
      name: 'متجر الشام',
      billingCycle: 'MONTHLY',
      subscriptionStartAt: new Date('2026-08-01T00:00:00Z'),
      subscriptionEndAt: new Date('2026-09-01T00:00:00Z'),
      owner: { id: 'owner-1', name: 'حسام', email: 'owner@example.com' },
      plan: { name: 'احترافي' },
    };

    beforeEach(() => {
      prisma.store.findUnique.mockResolvedValue(subscriptionStore);
    });

    it.each([
      [EmailEvent.SUBSCRIPTION_RENEWED, 'تم تجديد اشتراكك'],
      [EmailEvent.SUBSCRIPTION_PLAN_CHANGED, 'تم تغيير باقة اشتراكك'],
      [EmailEvent.SUBSCRIPTION_SUSPENDED, 'تم إيقاف اشتراكك مؤقتاً'],
      [EmailEvent.SUBSCRIPTION_CANCELLED, 'تم إلغاء اشتراكك'],
      [EmailEvent.SUBSCRIPTION_PAYMENT_RECEIVED, 'تم تأكيد استلام الدفعة'],
    ] as const)('renders the right template for %s', async (event, title) => {
      await service.sendSubscriptionEvent({
        event,
        storeId: 'store-1',
        idempotencySuffix: 'x',
      });
      expect(sent()[0].type).toBe(event);
      expect(sent()[0].text).toContain(title);
    });

    it('always addresses the store owner and is branded as the platform', async () => {
      await service.sendSubscriptionEvent({
        event: EmailEvent.SUBSCRIPTION_RENEWED,
        storeId: 'store-1',
        idempotencySuffix: 'x',
      });
      expect(sent()[0].recipientEmail).toBe('owner@example.com');
      expect(sent()[0].recipientUserId).toBe('owner-1');
      expect(sent()[0].html).toContain('TRENDWA');
    });

    it('includes the plan, cycle and both subscription dates', async () => {
      await service.sendSubscriptionEvent({
        event: EmailEvent.SUBSCRIPTION_RENEWED,
        storeId: 'store-1',
        idempotencySuffix: 'x',
      });
      const text = sent()[0].text;
      expect(text).toContain('احترافي');
      expect(text).toContain('شهرية');
      expect(text).toContain('تاريخ البداية');
      expect(text).toContain('تاريخ الانتهاء');
    });

    it('scopes the idempotency key to the store and the caller-supplied suffix', async () => {
      await service.sendSubscriptionEvent({
        event: EmailEvent.SUBSCRIPTION_RENEWED,
        storeId: 'store-1',
        idempotencySuffix: '2026-09-01',
      });
      expect(sent()[0].idempotencyKey).toBe(
        `${EmailEvent.SUBSCRIPTION_RENEWED}:store-1:2026-09-01`,
      );
    });

    it('formats the amount in USD, the subscription billing currency', async () => {
      await service.sendSubscriptionEvent({
        event: EmailEvent.SUBSCRIPTION_PAYMENT_RECEIVED,
        storeId: 'store-1',
        idempotencySuffix: 'x',
        amount: 50,
      });
      expect(sent()[0].text).toContain('50 USD');
    });

    it('passes the admin reason through on a suspension', async () => {
      await service.sendSubscriptionEvent({
        event: EmailEvent.SUBSCRIPTION_SUSPENDED,
        storeId: 'store-1',
        idempotencySuffix: 'x',
        reason: 'عدم السداد',
      });
      expect(sent()[0].text).toContain('عدم السداد');
    });

    it('names the previous plan on a package change', async () => {
      await service.sendSubscriptionEvent({
        event: EmailEvent.SUBSCRIPTION_PLAN_CHANGED,
        storeId: 'store-1',
        idempotencySuffix: 'x',
        previousPlanName: 'أساسي',
      });
      expect(sent()[0].text).toContain('أساسي');
    });

    it('sends nothing when the store or its owner email is missing', async () => {
      prisma.store.findUnique.mockResolvedValue(null);
      await service.sendSubscriptionEvent({
        event: EmailEvent.SUBSCRIPTION_RENEWED,
        storeId: 'store-1',
        idempotencySuffix: 'x',
      });
      expect(enqueue).not.toHaveBeenCalled();
    });

    it('tolerates a store with no plan assigned', async () => {
      prisma.store.findUnique.mockResolvedValue({
        ...subscriptionStore,
        plan: null,
      });
      await service.sendSubscriptionEvent({
        event: EmailEvent.SUBSCRIPTION_RENEWED,
        storeId: 'store-1',
        idempotencySuffix: 'x',
      });
      expect(enqueue).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------
  // Failure isolation — email must never break a business operation
  // -------------------------------------------------------------------

  describe('failure isolation', () => {
    it('swallows a database failure while loading an order', async () => {
      prisma.order.findUnique.mockRejectedValue(new Error('db down'));
      await expect(service.sendOrderPlaced(ORDER_ID)).resolves.toBeUndefined();
      expect(enqueue).not.toHaveBeenCalled();
    });

    it('swallows a queue failure rather than propagating it to the caller', async () => {
      enqueue.mockRejectedValue(new Error('queue exploded'));
      await expect(service.sendOrderPlaced(ORDER_ID)).resolves.toBeUndefined();
    });

    it('still sends the merchant email when the buyer email fails to queue', async () => {
      enqueue
        .mockRejectedValueOnce(new Error('queue exploded'))
        .mockResolvedValue(undefined);
      await service.sendOrderPlaced(ORDER_ID);
      expect(enqueue).toHaveBeenCalledTimes(2);
    });

    it.each([
      [
        'sendMerchantWelcome',
        () =>
          service.sendMerchantWelcome({
            userId: 'u',
            email: 'e@t.com',
            merchantName: 'n',
            storeId: 's',
            storeName: 'sn',
            planName: 'p',
            billingCycle: 'MONTHLY' as const,
          }),
      ],
      [
        'sendAdminNewMerchant',
        () =>
          service.sendAdminNewMerchant({
            storeId: 's',
            storeName: 'sn',
            merchantName: 'n',
            merchantEmail: 'e@t.com',
            merchantPhone: 'p',
            planName: 'pl',
          }),
      ],
      [
        'sendCustomerWelcome',
        () =>
          service.sendCustomerWelcome({
            userId: 'u',
            email: 'e@t.com',
            customerName: 'n',
            store,
          }),
      ],
      [
        'sendPasswordReset',
        () =>
          service.sendPasswordReset({
            userId: 'u',
            email: 'e@t.com',
            resetUrl: 'https://x',
            tokenHash: 'h',
          }),
      ],
      ['sendOrderPlaced', () => service.sendOrderPlaced(ORDER_ID)],
      [
        'sendOrderStatusUpdate',
        () => service.sendOrderStatusUpdate(ORDER_ID, 'SHIPPED'),
      ],
      [
        'sendOrderCancelledByCustomer',
        () => service.sendOrderCancelledByCustomer(ORDER_ID, 'r'),
      ],
      [
        'sendReturnStatusUpdate',
        () =>
          service.sendReturnStatusUpdate({
            returnId: 'r',
            orderId: ORDER_ID,
            status: 'APPROVED',
          }),
      ],
      [
        'sendRefundIssued',
        () =>
          service.sendRefundIssued({
            refundId: 'r',
            orderId: ORDER_ID,
            amount: 1,
            methodLabel: 'm',
          }),
      ],
      [
        'sendSubscriptionEvent',
        () =>
          service.sendSubscriptionEvent({
            event: EmailEvent.SUBSCRIPTION_RENEWED,
            storeId: 's',
            idempotencySuffix: 'x',
          }),
      ],
    ])(
      '%s never rejects, even when everything underneath fails',
      async (_name, call) => {
        const boom = new Error('everything is broken');
        prisma.order.findUnique.mockRejectedValue(boom);
        prisma.user.findMany.mockRejectedValue(boom);
        prisma.store.findUnique.mockRejectedValue(boom);
        enqueue.mockRejectedValue(boom);

        await expect(call()).resolves.toBeUndefined();
      },
    );
  });
});
