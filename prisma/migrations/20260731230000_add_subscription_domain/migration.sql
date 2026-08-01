-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIAL', 'ACTIVE', 'SUSPENDED', 'CANCELLED', 'PENDING_PAYMENT');

-- CreateEnum
CREATE TYPE "SubscriptionPaymentStatus" AS ENUM ('PAID', 'UNPAID', 'PENDING_PAYMENT', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "RenewalType" AS ENUM ('AUTO', 'MANUAL', 'DISABLED');

-- CreateEnum
CREATE TYPE "SubscriptionActivityType" AS ENUM ('CREATED', 'RENEWED', 'EXTENDED', 'PACKAGE_UPGRADED', 'PACKAGE_DOWNGRADED', 'SUSPENDED', 'REACTIVATED', 'CANCELLED', 'PAYMENT_RECORDED', 'PAYMENT_STATUS_CHANGED', 'NOTE_ADDED');

-- CreateEnum
CREATE TYPE "SubscriptionPackageChangeType" AS ENUM ('INITIAL', 'UPGRADE', 'DOWNGRADE');

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "paymentStatus" "SubscriptionPaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "renewalType" "RenewalType" NOT NULL DEFAULT 'MANUAL',
    "planId" TEXT,
    "basePrice" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "tax" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "finalAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'SYP',
    "trialEndsAt" TIMESTAMP(3),
    "lastPaymentAt" TIMESTAMP(3),
    "nextRenewalAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "suspendedAt" TIMESTAMP(3),
    "suspendReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_payments" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "method" TEXT,
    "status" "SubscriptionPaymentStatus" NOT NULL,
    "reference" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_invoices" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "discount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "tax" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "finalAmount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SYP',
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_package_changes" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "fromPlanId" TEXT,
    "toPlanId" TEXT NOT NULL,
    "changeType" "SubscriptionPackageChangeType" NOT NULL,
    "actorId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_package_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_activities" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "type" "SubscriptionActivityType" NOT NULL,
    "actorId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "previousValue" TEXT,
    "newValue" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_notes" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_storeId_key" ON "subscriptions"("storeId");

-- CreateIndex
CREATE INDEX "subscriptions_status_idx" ON "subscriptions"("status");

-- CreateIndex
CREATE INDEX "subscriptions_paymentStatus_idx" ON "subscriptions"("paymentStatus");

-- CreateIndex
CREATE INDEX "subscription_payments_subscriptionId_createdAt_idx" ON "subscription_payments"("subscriptionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_invoices_invoiceNumber_key" ON "subscription_invoices"("invoiceNumber");

-- CreateIndex
CREATE INDEX "subscription_invoices_subscriptionId_issuedAt_idx" ON "subscription_invoices"("subscriptionId", "issuedAt");

-- CreateIndex
CREATE INDEX "subscription_package_changes_subscriptionId_createdAt_idx" ON "subscription_package_changes"("subscriptionId", "createdAt");

-- CreateIndex
CREATE INDEX "subscription_activities_subscriptionId_createdAt_idx" ON "subscription_activities"("subscriptionId", "createdAt");

-- CreateIndex
CREATE INDEX "subscription_notes_subscriptionId_createdAt_idx" ON "subscription_notes"("subscriptionId", "createdAt");

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_invoices" ADD CONSTRAINT "subscription_invoices_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_package_changes" ADD CONSTRAINT "subscription_package_changes_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_package_changes" ADD CONSTRAINT "subscription_package_changes_fromPlanId_fkey" FOREIGN KEY ("fromPlanId") REFERENCES "plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_package_changes" ADD CONSTRAINT "subscription_package_changes_toPlanId_fkey" FOREIGN KEY ("toPlanId") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_activities" ADD CONSTRAINT "subscription_activities_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_notes" ADD CONSTRAINT "subscription_notes_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

