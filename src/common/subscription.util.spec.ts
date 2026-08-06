import { computeSubscriptionEnd, computeTrialEnd } from './subscription.util';

describe('computeTrialEnd', () => {
  it('grants exactly one month from the start date', () => {
    const end = computeTrialEnd(new Date('2026-08-06T10:00:00Z'));
    expect(end.toISOString().slice(0, 10)).toBe('2026-09-06');
  });

  it('rolls over the year at the end of December', () => {
    const end = computeTrialEnd(new Date('2026-12-15T00:00:00Z'));
    expect(end.getFullYear()).toBe(2027);
    expect(end.getMonth()).toBe(0);
  });

  it('is independent of billing cycle — the trial is always one month', () => {
    const start = new Date('2026-08-06T00:00:00Z');
    // Whereas the paid period differs per cycle:
    expect(computeSubscriptionEnd(start, 'YEARLY').getFullYear()).toBe(2027);
    expect(computeTrialEnd(start).getFullYear()).toBe(2026);
  });

  it('does not mutate the date it is given', () => {
    const start = new Date('2026-08-06T00:00:00Z');
    computeTrialEnd(start);
    expect(start.toISOString()).toBe('2026-08-06T00:00:00.000Z');
  });
});
