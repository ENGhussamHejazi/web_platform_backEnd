import { BillingCycle } from '../../generated/prisma';

/**
 * Every newly registered merchant gets one free month before any payment is
 * due — regardless of whether they picked monthly or yearly billing. The paid
 * period only starts when an admin renews the subscription after the trial.
 */
export const TRIAL_MONTHS = 1;

export function computeTrialEnd(start: Date): Date {
  const end = new Date(start);
  end.setMonth(end.getMonth() + TRIAL_MONTHS);
  return end;
}

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
