import { TransactionalMailService } from '../transactional-mail.service';

/** Every async method of TransactionalMailService, as an assertable jest.Mock. */
export type MailStub = jest.Mocked<TransactionalMailService>;

/**
 * No-op TransactionalMailService for unit tests.
 *
 * Every service that emits email now takes it as a constructor dependency, and
 * most of those tests don't care about the email itself — so rather than each
 * spec hand-rolling a mock that drifts as methods are added, they all share
 * this. Methods are memoised jest.fn()s, so a test that *does* want to assert
 * on a send can do `expect(mail.sendOrderPlaced).toHaveBeenCalledWith(...)`
 * with full type information on the recorded arguments.
 */
export function mailStub(): MailStub {
  const fns = new Map<string | symbol, jest.Mock>();
  return new Proxy({} as MailStub, {
    get(_target, prop) {
      if (!fns.has(prop)) {
        fns.set(prop, jest.fn().mockResolvedValue(undefined));
      }
      return fns.get(prop);
    },
  });
}
