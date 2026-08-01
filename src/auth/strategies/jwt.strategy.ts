import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { Role } from '../../../generated/prisma';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('jwt.accessSecret')!,
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        store: { select: { id: true, status: true } },
        customerOfStore: { select: { id: true, status: true } },
      },
    });
    if (!user) {
      throw new UnauthorizedException('المستخدم غير موجود');
    }
    // storeId means different things per role: for a MERCHANT it's the store
    // they own; for a CUSTOMER it's the store they hold an account with.
    const scopedStore =
      user.role === Role.CUSTOMER ? user.customerOfStore : user.store;
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      storeId: scopedStore?.id ?? null,
      storeStatus: scopedStore?.status ?? null,
    };
  }
}
