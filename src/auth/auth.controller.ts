import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import {
  clearRefreshCookie,
  omitRefreshToken,
  REFRESH_COOKIE_NAME,
  setRefreshCookie,
} from './refresh-cookie.util';
import {
  loginSchema,
  forgotPasswordSchema,
  registerMerchantSchema,
  resetPasswordSchema,
} from './dto/auth.schemas';
import type {
  LoginDto,
  ForgotPasswordDto,
  RegisterMerchantDto,
  ResetPasswordDto,
} from './dto/auth.schemas';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register/merchant')
  async registerMerchant(
    @Body(new ZodValidationPipe(registerMerchantSchema))
    dto: RegisterMerchantDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.authService.registerMerchant(dto);
    setRefreshCookie(res, this.config, data.refreshToken);
    return omitRefreshToken(data);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  @Post('login')
  async login(
    @Body(new ZodValidationPipe(loginSchema)) dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.authService.login(dto);
    setRefreshCookie(res, this.config, data.refreshToken);
    return omitRefreshToken(data);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  @Post('forgot-password')
  forgotPassword(
    @Body(new ZodValidationPipe(forgotPasswordSchema)) dto: ForgotPasswordDto,
  ) {
    return this.authService.forgotPassword(dto.email);
  }

  @Public()
  @HttpCode(200)
  @Post('reset-password')
  resetPassword(
    @Body(new ZodValidationPipe(resetPasswordSchema)) dto: ResetPasswordDto,
  ) {
    return this.authService.resetPassword(dto.token, dto.password);
  }

  @Public()
  @HttpCode(200)
  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = (req.cookies as Record<string, string> | undefined)?.[
      REFRESH_COOKIE_NAME
    ];
    if (!token) {
      clearRefreshCookie(res, this.config);
      throw new UnauthorizedException('رمز التحديث غير صالح أو منتهي الصلاحية');
    }
    const data = await this.authService.refresh(token);
    setRefreshCookie(res, this.config, data.refreshToken);
    return omitRefreshToken(data);
  }

  @HttpCode(200)
  @Post('logout')
  async logout(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    clearRefreshCookie(res, this.config);
    return this.authService.logout(user.id);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.authService.me(user.id);
  }

  @HttpCode(200)
  @Post('heartbeat')
  heartbeat(@CurrentUser() user: AuthUser) {
    return this.authService.heartbeat(user.id);
  }
}
