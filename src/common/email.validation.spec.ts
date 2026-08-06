import {
  isDisposableEmail,
  suggestEmailCorrection,
  trustedEmailSchema,
} from './email.validation';

const parse = (value: string) => trustedEmailSchema.safeParse(value);

describe('trustedEmailSchema', () => {
  it('accepts ordinary addresses', () => {
    for (const email of [
      'hussam@gmail.com',
      'a.b+tag@sub.example.co.uk',
      'merchant_01@my-store.sy',
    ]) {
      expect(parse(email).success).toBe(true);
    }
  });

  it('normalises case and surrounding whitespace', () => {
    const result = parse('  Hussam@GMAIL.com  ');
    expect(result.success).toBe(true);
    expect(result.success && result.data).toBe('hussam@gmail.com');
  });

  it('rejects malformed addresses', () => {
    for (const email of ['nope', 'a@', '@b.com', 'a b@c.com', 'a@@b.com']) {
      expect(parse(email).success).toBe(false);
    }
  });

  it('rejects domains that cannot receive mail', () => {
    for (const email of [
      'user@localhost',
      'user@server',
      'user@thing.local',
      'user@example.c',
    ]) {
      expect(parse(email).success).toBe(false);
    }
  });

  it('rejects a dotted local part that no MTA will route', () => {
    for (const email of ['.a@b.com', 'a.@b.com', 'a..b@c.com']) {
      expect(parse(email).success).toBe(false);
    }
  });

  it('rejects disposable inboxes', () => {
    for (const email of [
      'x@mailinator.com',
      'x@yopmail.com',
      'x@10minutemail.com',
      'x@guerrillamail.com',
    ]) {
      const result = parse(email);
      expect(result.success).toBe(false);
      expect(result.success === false && result.error.issues[0].message).toContain(
        'مؤقت',
      );
    }
  });

  it('catches a domain typo and names the correction', () => {
    const result = parse('hussam@gmial.com');
    expect(result.success).toBe(false);
    expect(result.success === false && result.error.issues[0].message).toContain(
      'hussam@gmail.com',
    );
  });

  it('enforces the length limits', () => {
    expect(parse(`${'a'.repeat(65)}@gmail.com`).success).toBe(false);
    expect(parse(`${'a'.repeat(250)}@gmail.com`).success).toBe(false);
  });
});

describe('helpers', () => {
  it('detects disposable domains case-insensitively', () => {
    expect(isDisposableEmail('X@MAILINATOR.COM')).toBe(true);
    expect(isDisposableEmail('x@gmail.com')).toBe(false);
  });

  it('suggests a correction only for known typos', () => {
    expect(suggestEmailCorrection('a@hotmial.com')).toBe('a@hotmail.com');
    expect(suggestEmailCorrection('a@gmail.com')).toBeNull();
  });
});
