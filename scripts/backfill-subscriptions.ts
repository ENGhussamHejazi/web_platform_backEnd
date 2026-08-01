/**
 * One-time (idempotent) backfill for the Subscription domain added in the
 * add_subscription_domain migration. Creates one Subscription row per Store
 * that already has a plan assigned, seeded from that store's current
 * Plan/billingCycle pricing, so the new admin Subscriptions page isn't blank
 * for existing stores. Store.planId/billingCycle/subscriptionStartAt/
 * subscriptionEndAt remain untouched and are still the source of truth for
 * plan + dates.
 *
 * Safe to re-run: skips stores that already have a Subscription row.
 */
import { PrismaClient } from '../generated/prisma';

const prisma = new PrismaClient();

async function main() {
  const stores = await prisma.store.findMany({
    where: { planId: { not: null } },
    include: { plan: true, subscription: true },
  });

  let created = 0;
  let skipped = 0;

  for (const store of stores) {
    if (store.subscription) {
      skipped += 1;
      continue;
    }
    if (!store.plan) {
      skipped += 1;
      continue;
    }

    const plan = store.plan;
    const isYearly = store.billingCycle === 'YEARLY';
    const basePrice = isYearly ? plan.priceYearly : plan.priceMonthly;
    const now = new Date();
    const isExpired = store.subscriptionEndAt ? store.subscriptionEndAt < now : false;

    await prisma.$transaction(async (tx) => {
      const subscription = await tx.subscription.create({
        data: {
          storeId: store.id,
          planId: plan.id,
          status: isExpired ? 'ACTIVE' : 'ACTIVE',
          paymentStatus: 'PAID',
          renewalType: 'MANUAL',
          basePrice,
          discount: 0,
          tax: 0,
          finalAmount: basePrice,
          currency: store.currency ?? 'SYP',
          lastPaymentAt: store.subscriptionStartAt ?? store.createdAt,
          nextRenewalAt: store.subscriptionEndAt ?? null,
        },
      });

      await tx.subscriptionPackageChange.create({
        data: {
          subscriptionId: subscription.id,
          toPlanId: plan.id,
          changeType: 'INITIAL',
          note: 'تهيئة أولية من بيانات المتجر الحالية (backfill)',
        },
      });

      await tx.subscriptionActivity.create({
        data: {
          subscriptionId: subscription.id,
          storeId: store.id,
          type: 'CREATED',
          title: 'تهيئة سجل الاشتراك',
          description: 'تم إنشاء سجل الاشتراك تلقائيًا من بيانات المتجر الحالية',
          newValue: plan.name,
        },
      });
    });

    created += 1;
  }

  console.log(
    `Backfill complete: ${stores.length} stores with a plan checked, ${created} subscriptions created, ${skipped} skipped (already existed or no plan).`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
