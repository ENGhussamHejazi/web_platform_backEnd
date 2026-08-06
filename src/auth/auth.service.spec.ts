import { BadRequestException, ConflictException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { TransactionalMailService } from '../mail/transactional-mail.service';
import { mailStub } from '../mail/testing/mail-stub';

describe('AuthService password recovery', () => {
  const prisma = {
    user: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    refreshToken: { updateMany: jest.fn() },
    $transaction: jest.fn(),
  };
  const jwt = {};
  const config = {
    get: jest.fn((key: string) =>
      key === 'frontendBaseUrl' ? 'http://localhost:5173' : undefined,
    ),
  };
  const emailQueue = { enqueue: jest.fn() };
  // A real TransactionalMailService over a mocked queue: the assertions below
  // are about what actually gets queued (the reset link), so stubbing the mail
  // service itself would test nothing.
  const mail = new TransactionalMailService(
    prisma as never,
    emailQueue as never,
    config as never,
  );

  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AuthService(
      prisma as never,
      jwt as never,
      config as never,
      mail,
    );
  });

  it('returns the same generic response for an unknown email and sends nothing', async () => {
    prisma.user.findFirst.mockResolvedValue(null);

    await expect(
      service.forgotPassword('missing@example.com'),
    ).resolves.toEqual({
      message:
        'إذا كان البريد الإلكتروني مسجلاً، فستصلك رسالة تحتوي على رابط استعادة كلمة المرور.',
    });
    expect(emailQueue.enqueue).not.toHaveBeenCalled();
  });

  it('stores only a hashed reset token and queues a 30-minute reset link', async () => {
    prisma.user.findFirst.mockResolvedValue({
      id: 'user-1',
      email: 'owner@example.com',
      customerOfStore: null,
    });
    prisma.user.update.mockResolvedValue({});
    emailQueue.enqueue.mockResolvedValue(undefined);

    await service.forgotPassword('OWNER@example.com');

    const queued = emailQueue.enqueue.mock.calls[0][0];
    const token = new URL(queued.text.match(/http[^\s]+/u)[0]).searchParams.get(
      'token',
    );
    const update = prisma.user.update.mock.calls[0][0];
    expect(token).toHaveLength(64);
    expect(update.data.passwordResetTokenHash).not.toBe(token);
    expect(update.data.passwordResetExpiresAt.getTime()).toBeGreaterThan(
      Date.now(),
    );
    expect(queued.text).toContain('/reset-password?token=');
  });

  it('rejects an invalid or expired reset token', async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    await expect(
      service.resetPassword('a'.repeat(64), 'StrongPass1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('changes the password, consumes the token, and revokes active sessions', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'user-1' });
    prisma.user.update.mockReturnValue({ operation: 'update-user' });
    prisma.refreshToken.updateMany.mockReturnValue({
      operation: 'revoke-tokens',
    });
    prisma.$transaction.mockResolvedValue([]);

    await expect(
      service.resetPassword('b'.repeat(64), 'StrongPass1'),
    ).resolves.toEqual({
      message: 'تم تغيير كلمة المرور بنجاح. يمكنك تسجيل الدخول الآن.',
    });

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          passwordResetTokenHash: null,
          passwordResetExpiresAt: null,
        }),
      }),
    );
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', revoked: false },
      data: { revoked: true },
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});

describe('AuthService registration emails', () => {
  const plan = {
    id: 'plan-1',
    name: 'احترافي',
    isActive: true,
    priceMonthly: 50,
    priceYearly: 500,
  };

  const merchantDto = {
    name: 'حسام',
    email: 'm@example.com',
    phone: '0999',
    password: 'StrongPass1',
    storeName: 'متجر الشام',
    storeSlug: 'sham',
    planId: 'plan-1',
    billingCycle: 'MONTHLY' as const,
    merchantType: 'ONLINE_SELLER' as const,
    businessCategories: ['ELECTRONICS'] as never,
    termsAccepted: true,
    privacyAccepted: true,
  };

  let prisma: any;
  let tx: any;
  let mail: ReturnType<typeof mailStub>;
  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    tx = {
      user: {
        create: jest.fn().mockResolvedValue({
          id: 'user-1',
          name: 'حسام',
          email: 'm@example.com',
          phone: '0999',
          role: 'MERCHANT',
          storeId: null,
        }),
      },
      store: {
        create: jest.fn().mockResolvedValue({
          id: 'store-1',
          name: 'متجر الشام',
          slug: 'sham',
          status: 'PENDING',
          statusNote: null,
          subscriptionEndAt: new Date('2026-09-01T00:00:00Z'),
        }),
      },
      homepageSection: { createMany: jest.fn() },
      storeApplication: { create: jest.fn() },
      subscription: { create: jest.fn().mockResolvedValue({ id: 'sub-1' }) },
      subscriptionPackageChange: { create: jest.fn() },
      subscriptionActivity: { create: jest.fn() },
    };

    prisma = {
      user: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() },
      store: { findUnique: jest.fn().mockResolvedValue(null) },
      plan: { findUnique: jest.fn().mockResolvedValue(plan) },
      refreshToken: { create: jest.fn() },
      $transaction: jest.fn((cb: (t: unknown) => unknown) => cb(tx)),
    };

    const jwt = {
      signAsync: jest.fn().mockResolvedValue('token'),
      decode: jest.fn().mockReturnValue({ exp: 2000000000 }),
    };
    const config = {
      get: jest.fn((key: string) =>
        key === 'frontendBaseUrl' ? 'http://localhost:5173' : 'secret',
      ),
    };

    mail = mailStub();
    service = new AuthService(
      prisma as never,
      jwt as never,
      config as never,
      mail,
    );
  });

  describe('registerMerchant', () => {
    it('welcomes the merchant with their store and plan details', async () => {
      await service.registerMerchant(merchantDto);

      expect(mail.sendMerchantWelcome).toHaveBeenCalledWith({
        userId: 'user-1',
        email: 'm@example.com',
        merchantName: 'حسام',
        storeId: 'store-1',
        storeName: 'متجر الشام',
        planName: 'احترافي',
        billingCycle: 'MONTHLY',
        trialEndsAt: new Date('2026-09-01T00:00:00Z'),
      });
    });

    it('starts every new merchant on a one-month free trial', async () => {
      await service.registerMerchant(merchantDto);

      const sub = tx.subscription.create.mock.calls[0][0].data;
      expect(sub.status).toBe('TRIAL');
      expect(sub.trialEndsAt).toBeInstanceOf(Date);
      // Nothing is due yet, but the contracted price is recorded so the
      // admin knows what falls due when the trial ends.
      expect(sub.paymentStatus).toBe('UNPAID');
      expect(sub.basePrice).toBe(50);
      expect(sub.nextRenewalAt).toEqual(sub.trialEndsAt);
    });

    it("ends the store's first period at the trial end, not a full billing cycle", async () => {
      await service.registerMerchant(merchantDto);

      const store = tx.store.create.mock.calls[0][0].data;
      const start = store.subscriptionStartAt as Date;
      const end = store.subscriptionEndAt as Date;
      const months =
        (end.getFullYear() - start.getFullYear()) * 12 +
        (end.getMonth() - start.getMonth());
      expect(months).toBe(1);
    });

    it('gives a yearly subscriber the same free month, not 13 paid months', async () => {
      await service.registerMerchant({
        ...merchantDto,
        billingCycle: 'YEARLY' as const,
      });

      const store = tx.store.create.mock.calls[0][0].data;
      const start = store.subscriptionStartAt as Date;
      const end = store.subscriptionEndAt as Date;
      const months =
        (end.getFullYear() - start.getFullYear()) * 12 +
        (end.getMonth() - start.getMonth());
      expect(months).toBe(1);
      // The yearly price is still what falls due once the trial is over.
      expect(tx.subscription.create.mock.calls[0][0].data.basePrice).toBe(500);
    });

    it('tells the merchant about the free month in the welcome email', async () => {
      await service.registerMerchant(merchantDto);
      expect(
        mail.sendMerchantWelcome.mock.calls[0][0].trialEndsAt,
      ).toBeInstanceOf(Date);
    });

    it('also alerts the platform admins', async () => {
      await service.registerMerchant(merchantDto);

      expect(mail.sendAdminNewMerchant).toHaveBeenCalledWith(
        expect.objectContaining({
          storeId: 'store-1',
          storeName: 'متجر الشام',
          merchantEmail: 'm@example.com',
          merchantPhone: '0999',
          planName: 'احترافي',
        }),
      );
    });

    it('sends both emails only after the transaction commits', async () => {
      prisma.$transaction.mockRejectedValue(new Error('rollback'));
      await expect(service.registerMerchant(merchantDto)).rejects.toThrow(
        'rollback',
      );
      expect(mail.sendMerchantWelcome).not.toHaveBeenCalled();
      expect(mail.sendAdminNewMerchant).not.toHaveBeenCalled();
    });

    it.each([
      [
        'a duplicate email',
        () => prisma.user.findFirst.mockResolvedValue({ id: 'existing' }),
      ],
      [
        'a taken slug',
        () => prisma.store.findUnique.mockResolvedValue({ id: 'existing' }),
      ],
    ])('sends nothing when registration fails on %s', async (_n, arrange) => {
      arrange();
      await expect(
        service.registerMerchant(merchantDto),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(mail.sendMerchantWelcome).not.toHaveBeenCalled();
    });

    it('sends nothing when the chosen plan is unavailable', async () => {
      prisma.plan.findUnique.mockResolvedValue(null);
      await expect(
        service.registerMerchant(merchantDto),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mail.sendMerchantWelcome).not.toHaveBeenCalled();
    });

    it('still registers the merchant when the welcome email fails', async () => {
      mail.sendMerchantWelcome.mockRejectedValue(new Error('mail down'));
      mail.sendAdminNewMerchant.mockRejectedValue(new Error('mail down'));
      await expect(
        service.registerMerchant(merchantDto),
      ).resolves.toMatchObject({ user: { email: 'm@example.com' } });
    });
  });

  describe('registerCustomer', () => {
    const customerDto = {
      name: 'سامر',
      email: 'c@example.com',
      phone: '0988',
      password: 'StrongPass1',
    };

    const storefront = {
      id: 'store-1',
      slug: 'sham',
      name: 'متجر الشام',
      status: 'ACTIVE',
      statusNote: null,
      logoUrl: null,
      primaryColor: '#7C3AED',
    };

    beforeEach(() => {
      prisma.store.findUnique.mockResolvedValue(storefront);
      prisma.user.create.mockResolvedValue({
        id: 'cust-1',
        name: 'سامر',
        email: 'c@example.com',
        role: 'CUSTOMER',
        storeId: 'store-1',
      });
    });

    it('welcomes the customer, branded with the store they signed up to', async () => {
      await service.registerCustomer(customerDto, 'store-1');

      expect(mail.sendCustomerWelcome).toHaveBeenCalledWith({
        userId: 'cust-1',
        email: 'c@example.com',
        customerName: 'سامر',
        store: storefront,
      });
    });

    it('sends nothing when the store does not exist', async () => {
      prisma.store.findUnique.mockResolvedValue(null);
      await expect(
        service.registerCustomer(customerDto, 'store-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mail.sendCustomerWelcome).not.toHaveBeenCalled();
    });

    it('still creates the account when the welcome email fails', async () => {
      mail.sendCustomerWelcome.mockRejectedValue(new Error('mail down'));
      await expect(
        service.registerCustomer(customerDto, 'store-1'),
      ).resolves.toMatchObject({ user: { email: 'c@example.com' } });
    });

    it('sends nothing when the email is already registered in that store', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'existing' });
      await expect(
        service.registerCustomer(customerDto, 'store-1'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(mail.sendCustomerWelcome).not.toHaveBeenCalled();
    });
  });
});
