import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { EmailQueueService } from './email-queue.service';
import { EmailEvent, EmailEventType } from './email-events';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { EmailBrand, RenderedEmail } from './templates/layout';
import {
  adminNewMerchantEmail,
  customerWelcomeEmail,
  merchantWelcomeEmail,
  passwordResetEmail,
} from './templates/account.templates';
import {
  MerchantNewOrderData,
  OrderEmailData,
  OrderStatusEmailData,
  RefundEmailData,
  ReturnStatusEmailData,
  merchantNewOrderEmail,
  orderCancelledEmail,
  orderConfirmationEmail,
  orderStatusUpdateEmail,
  refundIssuedEmail,
  returnStatusEmail,
} from './templates/order.templates';
import {
  SubscriptionEmailData,
  subscriptionCancelledEmail,
  subscriptionPaymentReceivedEmail,
  subscriptionPlanChangedEmail,
  subscriptionRenewedEmail,
  subscriptionSuspendedEmail,
} from './templates/subscription.templates';

const PLATFORM_NAME = 'TRENDWA';
const PLATFORM_COLOR = '#0EA5A4';

/**
 * Terminator for the fire-and-forget email calls scattered across the feature
 * services (`this.mail.sendX(...).catch(NOOP)`).
 *
 * Every method below is already failure-isolated, so in practice this never
 * runs — but an un-awaited promise that ever *did* reject would surface as an
 * unhandled rejection and take the whole process down mid-checkout. Attaching
 * a handler at the call site keeps that guarantee local instead of depending
 * on this class staying perfectly defensive forever.
 */
export const NOOP = () => {};

export interface StoreBrandSource {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string | null;
  primaryColor?: string | null;
  currency?: string | null;
}

interface DispatchInput {
  event: EmailEventType;
  idempotencySuffix: string;
  to: string | null | undefined;
  recipientUserId?: string | null;
  storeId?: string | null;
  orderId?: string | null;
  rendered: RenderedEmail;
}

/**
 * Emails a merchant sends to their *own customers*, under their own branding.
 * These are the ones gated behind the CUSTOMER_EMAILS plan feature.
 *
 * Deliberately excluded: MERCHANT_* and ADMIN_* (platform telling the merchant
 * something), SUBSCRIPTION_* (billing), APPLICATION_* (onboarding), and
 * PASSWORD_RESET — a customer locked out of a Basic-plan store still has to be
 * able to recover their account.
 */
const GATED_CUSTOMER_EVENTS = new Set<EmailEventType>([
  EmailEvent.CUSTOMER_WELCOME,
  EmailEvent.ORDER_CONFIRMATION,
  EmailEvent.ORDER_STATUS_UPDATE,
  EmailEvent.ORDER_CANCELLED_BY_CUSTOMER,
  EmailEvent.RETURN_STATUS_UPDATE,
  EmailEvent.REFUND_ISSUED,
]);

/**
 * The single entry point every feature module uses to send email.
 *
 * Callers never build templates, resolve branding, or touch EmailQueueService
 * directly — they call one typed method per business event. Every method is
 * failure-isolated: a broken template or a missing recipient is logged and
 * swallowed, never propagated, because none of these emails is important
 * enough to fail a checkout, a status change, or a registration over.
 */
@Injectable()
export class TransactionalMailService {
  private readonly logger = new Logger(TransactionalMailService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: EmailQueueService,
    private readonly config: ConfigService,
    private readonly entitlements: EntitlementsService,
  ) {}

  // ------------------------------------------------------------------
  // Branding & formatting helpers
  // ------------------------------------------------------------------

  private get baseUrl(): string {
    return (this.config.get<string>('frontendBaseUrl') ?? '').replace(
      /\/$/u,
      '',
    );
  }

  private platformBrand(): EmailBrand {
    return { name: PLATFORM_NAME, color: PLATFORM_COLOR };
  }

  private storeBrand(store: StoreBrandSource): EmailBrand {
    return {
      name: store.name,
      color: store.primaryColor ?? PLATFORM_COLOR,
      // Relative upload paths (the `local` storage driver) must be absolute in
      // an email — an inbox has no origin to resolve them against.
      logoUrl: store.logoUrl
        ? store.logoUrl.startsWith('http')
          ? store.logoUrl
          : `${this.baseUrl}${store.logoUrl}`
        : null,
    };
  }

  /** Short human-facing order reference — the full uuid is unusable in an email. */
  reference(id: string): string {
    return `#${id.slice(0, 8).toUpperCase()}`;
  }

  money(amount: unknown, currency = 'SYP'): string {
    const value = Number(amount ?? 0);
    return `${value.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${currency}`;
  }

  date(value: Date | string | null | undefined): string {
    if (!value) return '';
    const d = value instanceof Date ? value : new Date(value);
    return d.toLocaleDateString('ar-SY', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  private customerOrderUrl(slug: string, orderId: string): string {
    return `${this.baseUrl}/store/${encodeURIComponent(slug)}/account/orders/${orderId}`;
  }

  private merchantOrderUrl(orderId: string): string {
    return `${this.baseUrl}/merchant/orders/${orderId}`;
  }

  // ------------------------------------------------------------------
  // Dispatch
  // ------------------------------------------------------------------

  private async dispatch(input: DispatchInput): Promise<void> {
    if (!input.to) return;
    if (!(await this.isEntitled(input))) return;
    try {
      await this.queue.enqueue({
        idempotencyKey: `${input.event}:${input.idempotencySuffix}`,
        type: input.event,
        recipientUserId: input.recipientUserId ?? undefined,
        recipientEmail: input.to,
        storeId: input.storeId ?? undefined,
        orderId: input.orderId ?? undefined,
        subject: input.rendered.subject,
        html: input.rendered.html,
        text: input.rendered.text,
      });
    } catch (error) {
      this.logger.error(
        `Failed to enqueue ${input.event} for ${input.to}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /**
   * Store-branded emails sent to a *merchant's own customers* are a paid
   * feature (CUSTOMER_EMAILS). Everything else — merchant/admin alerts,
   * subscription notices, and password reset — is platform infrastructure and
   * always sends, regardless of plan: gating those would leave a Basic
   * merchant unable to recover their own account.
   */
  private async isEntitled(input: DispatchInput): Promise<boolean> {
    if (!input.storeId) return true;
    if (!GATED_CUSTOMER_EVENTS.has(input.event)) return true;
    try {
      return await this.entitlements.hasFeature(input.storeId, 'CUSTOMER_EMAILS');
    } catch (error) {
      // An entitlement lookup failure must not silently swallow a customer's
      // order confirmation — fail open, and make the reason visible.
      this.logger.error(
        `Entitlement check failed for ${input.event} (store ${input.storeId}); sending anyway`,
        error instanceof Error ? error.stack : String(error),
      );
      return true;
    }
  }

  /** Wraps a whole send (including data loading) so callers never need try/catch. */
  private async safely(event: string, fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (error) {
      this.logger.error(
        `Email event "${event}" failed`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  // ------------------------------------------------------------------
  // Account events
  // ------------------------------------------------------------------

  async sendMerchantWelcome(params: {
    userId: string;
    email: string;
    merchantName: string;
    storeId: string;
    storeName: string;
    planName: string;
    billingCycle: 'MONTHLY' | 'YEARLY';
    trialEndsAt?: Date | null;
  }): Promise<void> {
    await this.safely(EmailEvent.MERCHANT_WELCOME, async () => {
      await this.dispatch({
        event: EmailEvent.MERCHANT_WELCOME,
        idempotencySuffix: params.userId,
        to: params.email,
        recipientUserId: params.userId,
        storeId: params.storeId,
        rendered: merchantWelcomeEmail(this.platformBrand(), {
          merchantName: params.merchantName,
          storeName: params.storeName,
          planName: params.planName,
          billingCycle: params.billingCycle,
          trialEndsAt: params.trialEndsAt
            ? this.date(params.trialEndsAt)
            : undefined,
          dashboardUrl: `${this.baseUrl}/merchant`,
        }),
      });
    });
  }

  /** Notifies every super admin that a merchant signed up. */
  async sendAdminNewMerchant(params: {
    storeId: string;
    storeName: string;
    merchantName: string;
    merchantEmail: string;
    merchantPhone: string;
    planName: string;
  }): Promise<void> {
    await this.safely(EmailEvent.ADMIN_NEW_MERCHANT, async () => {
      const admins = await this.prisma.user.findMany({
        where: { role: 'SUPER_ADMIN' },
        select: { id: true, email: true },
      });
      const rendered = adminNewMerchantEmail(this.platformBrand(), {
        merchantName: params.merchantName,
        merchantEmail: params.merchantEmail,
        merchantPhone: params.merchantPhone,
        storeName: params.storeName,
        planName: params.planName,
        adminStoresUrl: `${this.baseUrl}/admin/stores`,
      });
      for (const admin of admins) {
        await this.dispatch({
          event: EmailEvent.ADMIN_NEW_MERCHANT,
          idempotencySuffix: `${params.storeId}:${admin.id}`,
          to: admin.email,
          recipientUserId: admin.id,
          storeId: params.storeId,
          rendered,
        });
      }
    });
  }

  async sendCustomerWelcome(params: {
    userId: string;
    email: string;
    customerName: string;
    store: StoreBrandSource;
  }): Promise<void> {
    await this.safely(EmailEvent.CUSTOMER_WELCOME, async () => {
      await this.dispatch({
        event: EmailEvent.CUSTOMER_WELCOME,
        idempotencySuffix: params.userId,
        to: params.email,
        recipientUserId: params.userId,
        storeId: params.store.id,
        rendered: customerWelcomeEmail(this.storeBrand(params.store), {
          customerName: params.customerName,
          storeName: params.store.name,
          storeUrl: `${this.baseUrl}/store/${encodeURIComponent(params.store.slug)}`,
        }),
      });
    });
  }

  async sendPasswordReset(params: {
    userId: string;
    email: string;
    resetUrl: string;
    tokenHash: string;
    /** Present for storefront customers, absent for platform accounts. */
    store?: StoreBrandSource | null;
  }): Promise<void> {
    await this.safely(EmailEvent.PASSWORD_RESET, async () => {
      const brand = params.store
        ? this.storeBrand(params.store)
        : this.platformBrand();
      await this.dispatch({
        event: EmailEvent.PASSWORD_RESET,
        idempotencySuffix: `${params.userId}:${params.tokenHash}`,
        to: params.email,
        recipientUserId: params.userId,
        storeId: params.store?.id,
        rendered: passwordResetEmail(brand, {
          resetUrl: params.resetUrl,
          expiresInMinutes: 30,
        }),
      });
    });
  }

  // ------------------------------------------------------------------
  // Order events
  // ------------------------------------------------------------------

  /**
   * Order confirmation to the buyer + new-order alert to the store owner.
   * Loads everything it needs from the order id so callers only pass the id —
   * this runs after the checkout transaction has committed, never inside it.
   */
  async sendOrderPlaced(orderId: string): Promise<void> {
    await this.safely(EmailEvent.ORDER_CONFIRMATION, async () => {
      const order = await this.loadOrder(orderId);
      if (!order) return;

      const store = order.store;
      const currency = store.currency ?? 'SYP';
      const customerEmail = order.customer?.email ?? order.guestEmail;
      const customerName =
        order.customer?.name ?? order.guestName ?? 'عميلنا العزيز';

      const data: OrderEmailData = {
        orderReference: this.reference(order.id),
        customerName,
        storeName: store.name,
        placedAt: this.date(order.createdAt),
        // Only top-level lines: a box's chosen contents are child rows priced
        // at 0 inside the box's own line, so listing them would double-count.
        items: order.items
          .filter((item) => !item.parentOrderItemId)
          .map((item) => ({
            name: item.variantLabel
              ? `${item.productName} — ${item.variantLabel}`
              : item.productName,
            quantity: String(Number(item.quantity)),
            lineTotal: this.money(
              Number(item.price) * Number(item.quantity),
              currency,
            ),
          })),
        subtotal: this.money(order.subtotal, currency),
        shippingCost: this.money(order.shippingCost, currency),
        discount:
          Number(order.loyaltyDiscount) > 0
            ? `- ${this.money(order.loyaltyDiscount, currency)}`
            : undefined,
        total: this.money(order.total, currency),
        paymentMethodLabel:
          PAYMENT_METHOD_LABELS[order.paymentMethod] ?? order.paymentMethod,
        fulfillmentLabel:
          order.fulfillmentType === 'PICKUP' ? 'استلام من المتجر' : 'توصيل',
        shippingAddress:
          order.fulfillmentType === 'PICKUP'
            ? undefined
            : order.shippingAddress,
        orderUrl: this.customerOrderUrl(store.slug, order.id),
      };

      await this.dispatch({
        event: EmailEvent.ORDER_CONFIRMATION,
        idempotencySuffix: order.id,
        to: customerEmail,
        recipientUserId: order.customerId,
        storeId: store.id,
        orderId: order.id,
        rendered: orderConfirmationEmail(this.storeBrand(store), data),
      });

      const merchantData: MerchantNewOrderData = {
        orderReference: data.orderReference,
        storeName: store.name,
        buyerName: customerName,
        buyerPhone: order.customer?.phone ?? order.guestPhone ?? '—',
        buyerEmail: customerEmail,
        placedAt: data.placedAt,
        itemCount: data.items.length,
        total: data.total,
        paymentMethodLabel: data.paymentMethodLabel,
        fulfillmentLabel: data.fulfillmentLabel,
        governorate: order.governorate,
        orderUrl: this.merchantOrderUrl(order.id),
      };
      await this.dispatch({
        event: EmailEvent.MERCHANT_NEW_ORDER,
        idempotencySuffix: order.id,
        to: store.owner.email,
        recipientUserId: store.owner.id,
        storeId: store.id,
        orderId: order.id,
        rendered: merchantNewOrderEmail(this.platformBrand(), merchantData),
      });
    });
  }

  /**
   * Buyer-facing status email. `PENDING` is skipped — the confirmation email
   * already covers that state, and re-sending it would just be noise.
   */
  async sendOrderStatusUpdate(
    orderId: string,
    status: string,
    note?: string | null,
  ): Promise<void> {
    if (status === 'PENDING') return;
    await this.safely(EmailEvent.ORDER_STATUS_UPDATE, async () => {
      const order = await this.loadOrder(orderId);
      if (!order) return;
      const customerEmail = order.customer?.email ?? order.guestEmail;
      if (!customerEmail) return;

      const data: OrderStatusEmailData = {
        orderReference: this.reference(order.id),
        customerName:
          order.customer?.name ?? order.guestName ?? 'عميلنا العزيز',
        storeName: order.store.name,
        status,
        note,
        trackingNumber: order.trackingNumber,
        driverName:
          status === 'OUT_FOR_DELIVERY' || status === 'SHIPPED'
            ? order.driverName
            : null,
        driverPhone:
          status === 'OUT_FOR_DELIVERY' || status === 'SHIPPED'
            ? order.driverPhone
            : null,
        estimatedDelivery: order.estimatedDeliveryAt
          ? this.date(order.estimatedDeliveryAt)
          : null,
        orderUrl: this.customerOrderUrl(order.store.slug, order.id),
      };

      await this.dispatch({
        event: EmailEvent.ORDER_STATUS_UPDATE,
        // Keyed by status so each stage sends once, but a re-entry into the
        // same status never duplicates.
        idempotencySuffix: `${order.id}:${status}`,
        to: customerEmail,
        recipientUserId: order.customerId,
        storeId: order.store.id,
        orderId: order.id,
        rendered: orderStatusUpdateEmail(this.storeBrand(order.store), data),
      });
    });
  }

  /** Customer-initiated cancellation: confirms to the buyer, alerts the merchant. */
  async sendOrderCancelledByCustomer(
    orderId: string,
    reason: string,
    note?: string | null,
  ): Promise<void> {
    await this.safely(EmailEvent.ORDER_CANCELLED_BY_CUSTOMER, async () => {
      const order = await this.loadOrder(orderId);
      if (!order) return;
      const currency = order.store.currency ?? 'SYP';
      const reference = this.reference(order.id);
      const customerEmail = order.customer?.email ?? order.guestEmail;
      const customerName =
        order.customer?.name ?? order.guestName ?? 'عميلنا العزيز';

      await this.dispatch({
        event: EmailEvent.ORDER_CANCELLED_BY_CUSTOMER,
        idempotencySuffix: order.id,
        to: customerEmail,
        recipientUserId: order.customerId,
        storeId: order.store.id,
        orderId: order.id,
        rendered: orderCancelledEmail(this.storeBrand(order.store), {
          orderReference: reference,
          recipientName: customerName,
          storeName: order.store.name,
          reason,
          note,
          total: this.money(order.total, currency),
          orderUrl: this.customerOrderUrl(order.store.slug, order.id),
          audience: 'customer',
        }),
      });

      await this.dispatch({
        event: EmailEvent.MERCHANT_ORDER_CANCELLED,
        idempotencySuffix: order.id,
        to: order.store.owner.email,
        recipientUserId: order.store.owner.id,
        storeId: order.store.id,
        orderId: order.id,
        rendered: orderCancelledEmail(this.platformBrand(), {
          orderReference: reference,
          recipientName: order.store.owner.name,
          storeName: order.store.name,
          reason,
          note,
          total: this.money(order.total, currency),
          orderUrl: this.merchantOrderUrl(order.id),
          audience: 'merchant',
        }),
      });
    });
  }

  async sendReturnStatusUpdate(params: {
    returnId: string;
    orderId: string;
    status: string;
    note?: string | null;
  }): Promise<void> {
    await this.safely(EmailEvent.RETURN_STATUS_UPDATE, async () => {
      const order = await this.loadOrder(params.orderId);
      if (!order) return;
      const customerEmail = order.customer?.email ?? order.guestEmail;
      if (!customerEmail) return;

      const data: ReturnStatusEmailData = {
        returnReference: this.reference(params.returnId),
        orderReference: this.reference(order.id),
        customerName:
          order.customer?.name ?? order.guestName ?? 'عميلنا العزيز',
        storeName: order.store.name,
        status: params.status,
        note: params.note,
        orderUrl: this.customerOrderUrl(order.store.slug, order.id),
      };
      await this.dispatch({
        event: EmailEvent.RETURN_STATUS_UPDATE,
        idempotencySuffix: `${params.returnId}:${params.status}`,
        to: customerEmail,
        recipientUserId: order.customerId,
        storeId: order.store.id,
        orderId: order.id,
        rendered: returnStatusEmail(this.storeBrand(order.store), data),
      });
    });
  }

  async sendRefundIssued(params: {
    refundId: string;
    orderId: string;
    amount: unknown;
    methodLabel: string;
    reason?: string | null;
  }): Promise<void> {
    await this.safely(EmailEvent.REFUND_ISSUED, async () => {
      const order = await this.loadOrder(params.orderId);
      if (!order) return;
      const customerEmail = order.customer?.email ?? order.guestEmail;
      if (!customerEmail) return;

      const data: RefundEmailData = {
        orderReference: this.reference(order.id),
        customerName:
          order.customer?.name ?? order.guestName ?? 'عميلنا العزيز',
        storeName: order.store.name,
        amount: this.money(params.amount, order.store.currency ?? 'SYP'),
        methodLabel: params.methodLabel,
        reason: params.reason,
        orderUrl: this.customerOrderUrl(order.store.slug, order.id),
      };
      await this.dispatch({
        event: EmailEvent.REFUND_ISSUED,
        idempotencySuffix: params.refundId,
        to: customerEmail,
        recipientUserId: order.customerId,
        storeId: order.store.id,
        orderId: order.id,
        rendered: refundIssuedEmail(this.storeBrand(order.store), data),
      });
    });
  }

  // ------------------------------------------------------------------
  // Subscription events (platform → merchant)
  // ------------------------------------------------------------------

  async sendSubscriptionEvent(params: {
    event: Extract<
      EmailEventType,
      | 'subscription-renewed'
      | 'subscription-plan-changed'
      | 'subscription-suspended'
      | 'subscription-cancelled'
      | 'subscription-payment-received'
    >;
    storeId: string;
    /** Distinguishes repeated events of the same kind on the same store. */
    idempotencySuffix: string;
    amount?: unknown;
    reason?: string | null;
    previousPlanName?: string;
  }): Promise<void> {
    await this.safely(params.event, async () => {
      const store = await this.prisma.store.findUnique({
        where: { id: params.storeId },
        select: {
          id: true,
          name: true,
          billingCycle: true,
          subscriptionStartAt: true,
          subscriptionEndAt: true,
          owner: { select: { id: true, name: true, email: true } },
          plan: { select: { name: true } },
        },
      });
      if (!store?.owner?.email) return;

      const data: SubscriptionEmailData = {
        merchantName: store.owner.name,
        storeName: store.name,
        planName: store.plan?.name ?? '—',
        billingCycleLabel: store.billingCycle === 'YEARLY' ? 'سنوية' : 'شهرية',
        amount:
          params.amount !== undefined
            ? this.money(params.amount, 'USD')
            : undefined,
        startsAt: store.subscriptionStartAt
          ? this.date(store.subscriptionStartAt)
          : undefined,
        expiresAt: store.subscriptionEndAt
          ? this.date(store.subscriptionEndAt)
          : undefined,
        reason: params.reason,
        previousPlanName: params.previousPlanName,
        dashboardUrl: `${this.baseUrl}/merchant/settings`,
      };

      const brand = this.platformBrand();
      const rendered = {
        [EmailEvent.SUBSCRIPTION_RENEWED]: () =>
          subscriptionRenewedEmail(brand, data),
        [EmailEvent.SUBSCRIPTION_PLAN_CHANGED]: () =>
          subscriptionPlanChangedEmail(brand, data),
        [EmailEvent.SUBSCRIPTION_SUSPENDED]: () =>
          subscriptionSuspendedEmail(brand, data),
        [EmailEvent.SUBSCRIPTION_CANCELLED]: () =>
          subscriptionCancelledEmail(brand, data),
        [EmailEvent.SUBSCRIPTION_PAYMENT_RECEIVED]: () =>
          subscriptionPaymentReceivedEmail(brand, data),
      }[params.event]();

      await this.dispatch({
        event: params.event,
        idempotencySuffix: `${params.storeId}:${params.idempotencySuffix}`,
        to: store.owner.email,
        recipientUserId: store.owner.id,
        storeId: store.id,
        rendered,
      });
    });
  }

  // ------------------------------------------------------------------

  private loadOrder(orderId: string) {
    return this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        customerId: true,
        guestName: true,
        guestEmail: true,
        guestPhone: true,
        subtotal: true,
        shippingCost: true,
        loyaltyDiscount: true,
        total: true,
        shippingAddress: true,
        governorate: true,
        fulfillmentType: true,
        paymentMethod: true,
        trackingNumber: true,
        driverName: true,
        driverPhone: true,
        estimatedDeliveryAt: true,
        createdAt: true,
        customer: {
          select: { id: true, name: true, email: true, phone: true },
        },
        items: {
          select: {
            productName: true,
            variantLabel: true,
            quantity: true,
            price: true,
            parentOrderItemId: true,
          },
        },
        store: {
          select: {
            id: true,
            name: true,
            slug: true,
            logoUrl: true,
            primaryColor: true,
            currency: true,
            owner: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });
  }
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH_ON_DELIVERY: 'الدفع عند الاستلام',
  CARD: 'بطاقة',
  CRYPTO: 'عملة رقمية',
};
