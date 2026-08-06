import { z } from 'zod';

/**
 * Registration-grade email validation.
 *
 * `z.string().email()` alone accepts plenty of addresses that will never
 * receive mail — throwaway inboxes, obvious domain typos, hostnames with no
 * real TLD. Since order confirmations, password resets and account recovery
 * all depend on the address being reachable, registration holds a higher bar
 * than a plain format check.
 *
 * This is validation only: it establishes the address is *plausible and
 * durable*, not that the person controls it. Proving control needs a
 * confirmation link, which is deliberately not part of this.
 */

/**
 * Throwaway/temp-mail providers. A merchant or customer signing up with one
 * loses their account the moment the inbox expires, and can never recover it.
 */
const DISPOSABLE_EMAIL_DOMAINS = new Set([
  '10minutemail.com',
  '20minutemail.com',
  'temp-mail.org',
  'tempmail.com',
  'tempmail.net',
  'guerrillamail.com',
  'guerrillamail.net',
  'guerrillamail.org',
  'sharklasers.com',
  'grr.la',
  'mailinator.com',
  'mailinator.net',
  'maildrop.cc',
  'dispostable.com',
  'yopmail.com',
  'yopmail.net',
  'trashmail.com',
  'trashmail.de',
  'throwawaymail.com',
  'fakeinbox.com',
  'getnada.com',
  'nada.email',
  'mohmal.com',
  'tempr.email',
  'emailondeck.com',
  'mintemail.com',
  'spamgourmet.com',
  'mailnesia.com',
  'inboxbear.com',
  'tempmailo.com',
  'moakt.com',
  'luxusmail.org',
  'byom.de',
  'discard.email',
  'einrot.com',
  'harakirimail.com',
  'incognitomail.com',
  'mytemp.email',
  'spam4.me',
  'burnermail.io',
]);

/**
 * Near-misses of the providers people actually use. Caught with a suggestion
 * rather than a generic rejection — the user almost always meant the fix, and
 * a typo here silently costs them every email the platform sends.
 */
const COMMON_DOMAIN_TYPOS: Record<string, string> = {
  'gmial.com': 'gmail.com',
  'gmai.com': 'gmail.com',
  'gmail.co': 'gmail.com',
  'gmail.cm': 'gmail.com',
  'gmail.con': 'gmail.com',
  'gmaill.com': 'gmail.com',
  'gnail.com': 'gmail.com',
  'gmali.com': 'gmail.com',
  'gamil.com': 'gmail.com',
  'gmail.om': 'gmail.com',
  'hotmial.com': 'hotmail.com',
  'hotmai.com': 'hotmail.com',
  'hotmail.co': 'hotmail.com',
  'hotmail.con': 'hotmail.com',
  'hotmall.com': 'hotmail.com',
  'homail.com': 'hotmail.com',
  'yahooo.com': 'yahoo.com',
  'yaho.com': 'yahoo.com',
  'yahoo.co': 'yahoo.com',
  'yahoo.con': 'yahoo.com',
  'outlok.com': 'outlook.com',
  'outloo.com': 'outlook.com',
  'outlook.co': 'outlook.com',
  'outlook.con': 'outlook.com',
  'iclould.com': 'icloud.com',
  'icloud.co': 'icloud.com',
  'iclod.com': 'icloud.com',
  'protonmai.com': 'protonmail.com',
  'protonmail.co': 'protonmail.com',
};

export function emailDomain(email: string): string {
  return email.slice(email.lastIndexOf('@') + 1).toLowerCase();
}

export function isDisposableEmail(email: string): boolean {
  return DISPOSABLE_EMAIL_DOMAINS.has(emailDomain(email));
}

export function suggestEmailCorrection(email: string): string | null {
  const domain = emailDomain(email);
  const fixed = COMMON_DOMAIN_TYPOS[domain];
  if (!fixed) return null;
  return `${email.slice(0, email.lastIndexOf('@'))}@${fixed}`;
}

// A real, routable domain: at least one dot, and an alphabetic TLD of 2+.
// Rejects `user@localhost`, `user@server`, `user@1.2.3.4`.
const ROUTABLE_DOMAIN = /^(?=.{1,253}$)([a-z0-9](-*[a-z0-9])*\.)+[a-z]{2,}$/u;

// TLDs reserved for private networks and documentation (RFC 2606 / RFC 6762).
// They look well-formed but can never receive mail from the internet.
const RESERVED_TLDS = new Set([
  'local',
  'localhost',
  'localdomain',
  'internal',
  'intranet',
  'private',
  'lan',
  'home',
  'corp',
  'test',
  'example',
  'invalid',
]);

/**
 * Email field for registration. Normalises (trim + lowercase) so the same
 * address can't produce two accounts differing only in case, then applies the
 * deliverability rules above.
 */
export const trustedEmailSchema = z
  .string({ message: 'البريد الإلكتروني مطلوب' })
  .trim()
  .toLowerCase()
  .max(254, 'البريد الإلكتروني طويل جداً')
  .email('صيغة البريد الإلكتروني غير صحيحة')
  .superRefine((value, ctx) => {
    const at = value.lastIndexOf('@');
    const local = value.slice(0, at);
    const domain = value.slice(at + 1);

    if (local.length > 64) {
      ctx.addIssue({ code: 'custom', message: 'البريد الإلكتروني غير صالح' });
      return;
    }
    if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) {
      ctx.addIssue({ code: 'custom', message: 'صيغة البريد الإلكتروني غير صحيحة' });
      return;
    }
    const tld = domain.slice(domain.lastIndexOf('.') + 1);
    if (!ROUTABLE_DOMAIN.test(domain) || RESERVED_TLDS.has(tld)) {
      ctx.addIssue({
        code: 'custom',
        message: 'نطاق البريد الإلكتروني غير صالح، استخدم بريداً حقيقياً مثل example@gmail.com',
      });
      return;
    }

    const suggestion = suggestEmailCorrection(value);
    if (suggestion) {
      ctx.addIssue({
        code: 'custom',
        message: `هل تقصد ${suggestion}؟ تحقق من كتابة البريد الإلكتروني`,
      });
      return;
    }

    if (DISPOSABLE_EMAIL_DOMAINS.has(domain)) {
      ctx.addIssue({
        code: 'custom',
        message:
          'لا يمكن التسجيل ببريد إلكتروني مؤقت. استخدم بريداً دائماً حتى تتمكن من استعادة حسابك واستلام إشعارات الطلبات',
      });
    }
  });
