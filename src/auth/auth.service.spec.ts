import { BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service';

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

  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AuthService(
      prisma as never,
      jwt as never,
      config as never,
      emailQueue as never,
    );
  });

  it('returns the same generic response for an unknown email and sends nothing', async () => {
    prisma.user.findFirst.mockResolvedValue(null);

    await expect(service.forgotPassword('missing@example.com')).resolves.toEqual({
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
    const token = new URL(queued.text.match(/http[^\s]+/u)[0]).searchParams.get('token');
    const update = prisma.user.update.mock.calls[0][0];
    expect(token).toHaveLength(64);
    expect(update.data.passwordResetTokenHash).not.toBe(token);
    expect(update.data.passwordResetExpiresAt.getTime()).toBeGreaterThan(Date.now());
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
    prisma.refreshToken.updateMany.mockReturnValue({ operation: 'revoke-tokens' });
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
