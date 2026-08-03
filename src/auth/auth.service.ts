import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { EmailQueueService } from '../mail/email-queue.service';
import { Role } from '../../generated/prisma';
import { computeSubscriptionEnd } from '../common/subscription.util';
import {
  LoginDto,
  RegisterCustomerDto,
  RegisterMerchantDto,
} from './dto/auth.schemas';

interface TokenUser {
  id: string;
  email: string;
  role: Role;
  storeId: string | null;
}

@Injectable()
export class AuthService {
  private readonly passwordResetCooldowns = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly emailQueue: EmailQueueService,
  ) {}

  async forgotPassword(email: string, storeSlug?: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const scopeKey = `${storeSlug ?? 'platform'}:${normalizedEmail}`;
    const now = Date.now();
    const response = {
      message:
        'إذا كان البريد الإلكتروني مسجلاً، فستصلك رسالة تحتوي على رابط استعادة كلمة المرور.',
    };

    if (now - (this.passwordResetCooldowns.get(scopeKey) ?? 0) < 60_000) {
      return response;
    }
    this.passwordResetCooldowns.set(scopeKey, now);

    const user = storeSlug
      ? await this.prisma.user.findFirst({
          where: {
            email: normalizedEmail,
            role: Role.CUSTOMER,
            customerOfStore: { slug: storeSlug, status: 'ACTIVE' },
          },
          include: { customerOfStore: { select: { name: true } } },
        })
      : await this.prisma.user.findFirst({
          where: { email: normalizedEmail, storeId: null },
          include: { customerOfStore: { select: { name: true } } },
        });

    // Keep the response identical to prevent discovering registered emails.
    if (!user) return response;

    const token = randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(token);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetTokenHash: tokenHash,
        passwordResetExpiresAt: new Date(now + 30 * 60 * 1000),
      },
    });

    const frontendBaseUrl = this.config
      .get<string>('frontendBaseUrl')!
      .replace(/\/$/u, '');
    const resetPath = storeSlug
      ? `/store/${encodeURIComponent(storeSlug)}/reset-password`
      : '/reset-password';
    const resetUrl = `${frontendBaseUrl}${resetPath}?token=${encodeURIComponent(token)}`;
    const storeName = user.customerOfStore?.name ?? 'سوق سوريا';

    await this.emailQueue.enqueue({
      idempotencyKey: `password-reset:${user.id}:${tokenHash}`,
      type: 'PASSWORD_RESET',
      recipientUserId: user.id,
      recipientEmail: user.email,
      subject: `استعادة كلمة المرور — ${storeName}`,
      text: `طلبت استعادة كلمة المرور. افتح الرابط التالي خلال 30 دقيقة:\n${resetUrl}\n\nإذا لم تطلب ذلك، تجاهل هذه الرسالة.`,
      html: `<div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.8"><h2>استعادة كلمة المرور</h2><p>طلبت استعادة كلمة المرور لحسابك في ${this.escapeHtml(storeName)}.</p><p><a href="${this.escapeHtml(resetUrl)}">تعيين كلمة مرور جديدة</a></p><p>صلاحية الرابط 30 دقيقة ويُستخدم مرة واحدة فقط.</p><p>إذا لم تطلب ذلك، تجاهل هذه الرسالة.</p></div>`,
    });
    return response;
  }

  async resetPassword(token: string, password: string, storeSlug?: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        passwordResetTokenHash: this.hashToken(token),
        passwordResetExpiresAt: { gt: new Date() },
        ...(storeSlug
          ? {
              role: Role.CUSTOMER,
              customerOfStore: { slug: storeSlug, status: 'ACTIVE' },
            }
          : { storeId: null }),
      },
      select: { id: true },
    });
    if (!user) {
      throw new BadRequestException(
        'رابط استعادة كلمة المرور غير صالح أو منتهي الصلاحية',
      );
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash: await bcrypt.hash(password, 10),
          passwordResetTokenHash: null,
          passwordResetExpiresAt: null,
        },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: user.id, revoked: false },
        data: { revoked: true },
      }),
    ]);
    return { message: 'تم تغيير كلمة المرور بنجاح. يمكنك تسجيل الدخول الآن.' };
  }

  async registerCustomer(dto: RegisterCustomerDto, storeId: string) {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: {
        id: true,
        slug: true,
        name: true,
        status: true,
        statusNote: true,
      },
    });
    if (!store) {
      throw new BadRequestException('المتجر غير موجود');
    }
    const existing = await this.prisma.user.findFirst({
      where: { email: dto.email, storeId },
    });
    if (existing) {
      throw new ConflictException(
        'البريد الإلكتروني مسجل بالفعل في هذا المتجر',
      );
    }
    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        passwordHash: await bcrypt.hash(dto.password, 10),
        role: Role.CUSTOMER,
        storeId,
      },
    });
    return this.buildAuthResponse(user, store);
  }

  async registerMerchant(dto: RegisterMerchantDto) {
    const [existingUser, slugTaken, plan, passwordHash] = await Promise.all([
      this.prisma.user.findFirst({
        where: { email: dto.email, storeId: null },
      }),
      this.prisma.store.findUnique({ where: { slug: dto.storeSlug } }),
      this.prisma.plan.findUnique({ where: { id: dto.planId } }),
      bcrypt.hash(dto.password, 10),
    ]);
    if (existingUser) {
      throw new ConflictException('البريد الإلكتروني مسجل بالفعل');
    }
    if (slugTaken) {
      throw new ConflictException('رابط المتجر مستخدم بالفعل، اختر رابطاً آخر');
    }
    if (!plan || !plan.isActive) {
      throw new BadRequestException('الباقة المختارة غير متوفرة');
    }

    const { user, store } = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name: dto.name,
          email: dto.email,
          phone: dto.phone,
          passwordHash,
          role: Role.MERCHANT,
        },
      });
      const subscriptionStartAt = new Date();
      const store = await tx.store.create({
        data: {
          ownerId: created.id,
          name: dto.storeName,
          slug: dto.storeSlug,
          status: 'PENDING',
          planId: plan.id,
          billingCycle: dto.billingCycle,
          businessCategories: dto.businessCategories,
          subscriptionStartAt,
          subscriptionEndAt: computeSubscriptionEnd(
            subscriptionStartAt,
            dto.billingCycle,
          ),
        },
      });
      await tx.homepageSection.createMany({
        data: [
          {
            storeId: store.id,
            type: 'ALL_PRODUCTS',
            title: 'كل المنتجات',
            subtitle: 'اكتشف أحدث المنتجات المتوفرة في المتجر',
            config: { limit: 4 },
            sortOrder: 0,
          },
          {
            storeId: store.id,
            type: 'ALL_CATEGORY_PRODUCTS',
            config: { limit: 4 },
            sortOrder: 1,
          },
        ],
      });
      await tx.storeApplication.create({
        data: {
          userId: created.id,
          storeId: store.id,
          merchantType: dto.merchantType,
          businessCategories: dto.businessCategories,
          status: 'DRAFT',
          currentStep: 1,
          accountInfo: {
            termsAccepted: dto.termsAccepted,
            privacyAccepted: dto.privacyAccepted,
          },
        },
      });

      const basePrice =
        dto.billingCycle === 'YEARLY' ? plan.priceYearly : plan.priceMonthly;
      const subscription = await tx.subscription.create({
        data: {
          storeId: store.id,
          planId: plan.id,
          status: 'ACTIVE',
          paymentStatus: 'UNPAID',
          renewalType: 'MANUAL',
          basePrice,
          finalAmount: basePrice,
          nextRenewalAt: store.subscriptionEndAt,
        },
      });
      await tx.subscriptionPackageChange.create({
        data: {
          subscriptionId: subscription.id,
          toPlanId: plan.id,
          changeType: 'INITIAL',
        },
      });
      await tx.subscriptionActivity.create({
        data: {
          subscriptionId: subscription.id,
          storeId: store.id,
          type: 'CREATED',
          title: 'تسجيل اشتراك جديد عند إنشاء المتجر',
          newValue: plan.name,
        },
      });

      return { user: created, store };
    });

    return this.buildAuthResponse(user, store);
  }

  async login(dto: LoginDto, storeId: string | null = null) {
    const user = storeId
      ? await this.prisma.user.findFirst({
          where: { email: dto.email, storeId, role: Role.CUSTOMER },
        })
      : await this.prisma.user.findFirst({
          where: { email: dto.email, storeId: null },
        });
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException(
        'البريد الإلكتروني أو كلمة المرور غير صحيحة',
      );
    }
    return this.buildAuthResponse(user);
  }

  async refresh(refreshToken: string) {
    let payload: { sub: string };
    try {
      payload = await this.jwt.verifyAsync(refreshToken, {
        secret: this.config.get<string>('jwt.refreshSecret'),
      });
    } catch {
      throw new UnauthorizedException('رمز التحديث غير صالح أو منتهي الصلاحية');
    }

    const tokenHash = this.hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });
    if (!stored || stored.revoked || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('رمز التحديث غير صالح أو منتهي الصلاحية');
    }

    // Rotate: revoke the used token, issue a fresh pair.
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revoked: true },
    });

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user) {
      throw new UnauthorizedException('المستخدم غير موجود');
    }
    return this.buildAuthResponse(user);
  }

  async logout(userId: string) {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revoked: false },
      data: { revoked: true },
    });
    return { success: true };
  }

  async heartbeat(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { lastActiveAt: new Date() },
    });
    return { success: true };
  }

  private async buildAuthResponse(
    user: TokenUser,
    knownStore?: {
      id: string;
      slug: string;
      name: string;
      status: string;
      statusNote: string | null;
    } | null,
  ) {
    const [accessToken, refreshToken, store] = await Promise.all([
      this.jwt.signAsync(
        {
          sub: user.id,
          email: user.email,
          role: user.role,
          storeId: user.storeId ?? null,
        },
        {
          secret: this.config.get<string>('jwt.accessSecret'),
          expiresIn: this.config.get<string>('jwt.accessTtl'),
        } as JwtSignOptions,
      ),
      this.jwt.signAsync({ sub: user.id, jti: randomUUID() }, {
        secret: this.config.get<string>('jwt.refreshSecret'),
        expiresIn: this.config.get<string>('jwt.refreshTtl'),
      } as JwtSignOptions),
      knownStore !== undefined
        ? Promise.resolve(knownStore)
        : user.role === Role.CUSTOMER
          ? user.storeId
            ? this.prisma.store.findUnique({
                where: { id: user.storeId },
                select: {
                  id: true,
                  slug: true,
                  name: true,
                  status: true,
                  statusNote: true,
                },
              })
            : Promise.resolve(null)
          : this.prisma.store.findUnique({
              where: { ownerId: user.id },
              select: {
                id: true,
                slug: true,
                name: true,
                status: true,
                statusNote: true,
              },
            }),
    ]);

    await this.persistRefreshToken(user.id, refreshToken);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        store: store ?? null,
      },
    };
  }

  private async persistRefreshToken(userId: string, token: string) {
    const decoded = this.jwt.decode(token);
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: this.hashToken(token),
        expiresAt: new Date(decoded.exp * 1000),
      },
    });
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private escapeHtml(value: string) {
    return value.replace(/[&<>"']/gu, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
    })[char]!);
  }
}
