/**
 * Single source of truth for every transactional email the platform sends.
 *
 * The value is what lands in `EmailLog.type`, so it is also what an admin
 * filters by when auditing deliveries — keep the strings stable once shipped.
 * Adding an event means adding one entry here, one template, and one
 * `TransactionalMailService` method; nothing else needs to change.
 */
export const EmailEvent = {
  // ---- Accounts (platform) ----
  MERCHANT_WELCOME: 'merchant-welcome',
  ADMIN_NEW_MERCHANT: 'admin-new-merchant',
  PASSWORD_RESET: 'PASSWORD_RESET',

  // ---- Store application lifecycle (platform) ----
  APPLICATION_RECEIVED: 'store-application-received',
  APPLICATION_STATUS: 'store-application-status',

  // ---- Accounts (storefront) ----
  CUSTOMER_WELCOME: 'customer-welcome',

  // ---- Orders ----
  ORDER_CONFIRMATION: 'order-confirmation',
  ORDER_STATUS_UPDATE: 'order-status-update',
  ORDER_CANCELLED_BY_CUSTOMER: 'order-cancelled-by-customer',
  MERCHANT_NEW_ORDER: 'merchant-new-order',
  MERCHANT_ORDER_CANCELLED: 'merchant-order-cancelled',

  // ---- Returns & refunds ----
  RETURN_STATUS_UPDATE: 'return-status-update',
  REFUND_ISSUED: 'refund-issued',

  // ---- Subscriptions (platform → merchant) ----
  SUBSCRIPTION_RENEWED: 'subscription-renewed',
  SUBSCRIPTION_PLAN_CHANGED: 'subscription-plan-changed',
  SUBSCRIPTION_SUSPENDED: 'subscription-suspended',
  SUBSCRIPTION_CANCELLED: 'subscription-cancelled',
  SUBSCRIPTION_PAYMENT_RECEIVED: 'subscription-payment-received',
} as const;

export type EmailEventType = (typeof EmailEvent)[keyof typeof EmailEvent];
