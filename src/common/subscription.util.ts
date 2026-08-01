import { BillingCycle } from '../../generated/prisma';

export function computeSubscriptionEnd(
  start: Date,
  billingCycle: BillingCycle | null | undefined,
): Date {
  const end = new Date(start);
  if (billingCycle === 'YEARLY') {
    end.setFullYear(end.getFullYear() + 1);
  } else {
    end.setMonth(end.getMonth() + 1);
  }
  return end;
}
