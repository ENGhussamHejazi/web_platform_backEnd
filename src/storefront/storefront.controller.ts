import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { StorefrontService } from './storefront.service';
import { AuthService } from '../auth/auth.service';
import {
  omitRefreshToken,
  setRefreshCookie,
} from '../auth/refresh-cookie.util';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';
import { CaptchaGuard } from '../common/captcha/captcha.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import {
  createGuestOrderSchema,
  listPublicProductsQuerySchema,
} from './dto/storefront.schemas';
import type {
  CreateGuestOrderDto,
  ListPublicProductsQueryDto,
} from './dto/storefront.schemas';
import {
  forgotPasswordSchema,
  loginSchema,
  registerCustomerSchema,
  resetPasswordSchema,
} from '../auth/dto/auth.schemas';
import type {
  ForgotPasswordDto,
  LoginDto,
  RegisterCustomerDto,
  ResetPasswordDto,
} from '../auth/dto/auth.schemas';

@Controller('public/stores/:slug')
@Public()
export class StorefrontController {
  constructor(
    private readonly storefrontService: StorefrontService,
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('auth/register')
  async registerCustomer(
    @Param('slug') slug: string,
    @Body(new ZodValidationPipe(registerCustomerSchema))
    dto: RegisterCustomerDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const storeId = await this.storefrontService.getActiveStoreId(slug);
    const data = await this.authService.registerCustomer(dto, storeId);
    setRefreshCookie(res, this.config, data.refreshToken);
    return omitRefreshToken(data);
  }

  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('auth/login')
  async login(
    @Param('slug') slug: string,
    @Body(new ZodValidationPipe(loginSchema)) dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const storeId = await this.storefrontService.getActiveStoreId(slug);
    const data = await this.authService.login(dto, storeId);
    setRefreshCookie(res, this.config, data.refreshToken);
    return omitRefreshToken(data);
  }

  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('auth/forgot-password')
  forgotPassword(
    @Param('slug') slug: string,
    @Body(new ZodValidationPipe(forgotPasswordSchema)) dto: ForgotPasswordDto,
  ) {
    return this.authService.forgotPassword(dto.email, slug);
  }

  @HttpCode(200)
  @Post('auth/reset-password')
  resetPassword(
    @Param('slug') slug: string,
    @Body(new ZodValidationPipe(resetPasswordSchema)) dto: ResetPasswordDto,
  ) {
    return this.authService.resetPassword(dto.token, dto.password, slug);
  }

  @Get()
  getStore(@Param('slug') slug: string) {
    return this.storefrontService.resolveStore(slug);
  }

  @Get('products')
  listProducts(
    @Param('slug') slug: string,
    @Query(new ZodValidationPipe(listPublicProductsQuerySchema))
    query: ListPublicProductsQueryDto,
  ) {
    return this.storefrontService.listProducts(slug, query);
  }

  @Get('products/:productId')
  getProduct(
    @Param('slug') slug: string,
    @Param('productId') productId: string,
  ) {
    return this.storefrontService.getProduct(slug, productId);
  }

  @Get('homepage-sections')
  listHomepageSections(@Param('slug') slug: string) {
    return this.storefrontService.listHomepageSections(slug);
  }

  @Get('shipping-zones')
  listShippingZones(@Param('slug') slug: string) {
    return this.storefrontService.listShippingZones(slug);
  }

  @Get('cities')
  listCities(@Param('slug') slug: string, @Query('governorate') governorate?: string) {
    return this.storefrontService.listCitiesForStore(slug, governorate);
  }

  // @Public() keeps this reachable for guest checkout; OptionalJwtAuthGuard
  // additionally populates @CurrentUser() when a valid customer token is
  // sent, so the order can be linked to their account without requiring it.
  @UseGuards(CaptchaGuard, OptionalJwtAuthGuard)
  @Post('orders')
  createOrder(
    @Param('slug') slug: string,
    @Body(new ZodValidationPipe(createGuestOrderSchema))
    dto: CreateGuestOrderDto,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.storefrontService.createGuestOrder(slug, dto, user);
  }
}
