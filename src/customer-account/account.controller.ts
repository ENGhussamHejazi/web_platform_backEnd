import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { CustomerAccountService } from './account.service';
import { StorageService, MAX_IMAGE_BYTES } from '../storage/storage.service';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { Role } from '../../generated/prisma';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import {
  cancelOrderSchema,
  createAddressSchema,
  listMyOrdersQuerySchema,
  requestReturnSchema,
  updateAddressSchema,
  updateProfileSchema,
} from './dto/account.schemas';
import type {
  CancelOrderDto,
  CreateAddressDto,
  ListMyOrdersQueryDto,
  RequestReturnDto,
  UpdateAddressDto,
  UpdateProfileDto,
} from './dto/account.schemas';

// Not @Public() at the class level (unlike StorefrontController) so every
// route here defaults to requiring auth; @Roles(CUSTOMER) narrows it further.
@Controller('public/stores/:slug/account')
@Roles(Role.CUSTOMER)
export class CustomerAccountController {
  constructor(
    private readonly accountService: CustomerAccountService,
    private readonly storage: StorageService,
  ) {}

  @Get()
  getProfile(@Param('slug') slug: string, @CurrentUser() user: AuthUser) {
    return this.accountService.getProfile(slug, user);
  }

  @Patch()
  updateProfile(
    @Param('slug') slug: string,
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(updateProfileSchema)) dto: UpdateProfileDto,
  ) {
    return this.accountService.updateProfile(slug, user, dto);
  }

  @Post('avatar')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_IMAGE_BYTES },
    }),
  )
  async uploadAvatar(
    @Param('slug') slug: string,
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('لم يتم إرسال أي ملف');
    const stored = await this.storage.uploadImage(file, 'avatars');
    return this.accountService.updateAvatar(slug, user, stored);
  }

  @Get('overview')
  getOverview(@Param('slug') slug: string, @CurrentUser() user: AuthUser) {
    return this.accountService.getOverview(slug, user);
  }

  @Get('orders')
  listOrders(
    @Param('slug') slug: string,
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(listMyOrdersQuerySchema))
    query: ListMyOrdersQueryDto,
  ) {
    return this.accountService.listOrders(slug, user, query);
  }

  @Get('orders/:orderId')
  getOrder(
    @Param('slug') slug: string,
    @Param('orderId') orderId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.accountService.getOrder(slug, user, orderId);
  }

  @Get('orders/:orderId/invoice')
  getInvoice(
    @Param('slug') slug: string,
    @Param('orderId') orderId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.accountService.getInvoice(slug, user, orderId);
  }

  @Post('orders/:orderId/cancel')
  cancelOrder(
    @Param('slug') slug: string,
    @Param('orderId') orderId: string,
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(cancelOrderSchema)) dto: CancelOrderDto,
  ) {
    return this.accountService.cancelOrder(slug, user, orderId, dto);
  }

  @Post('orders/:orderId/returns')
  requestReturn(
    @Param('slug') slug: string,
    @Param('orderId') orderId: string,
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(requestReturnSchema)) dto: RequestReturnDto,
  ) {
    return this.accountService.requestReturn(slug, user, orderId, dto);
  }

  @Get('addresses')
  listAddresses(@Param('slug') slug: string, @CurrentUser() user: AuthUser) {
    return this.accountService.listAddresses(slug, user);
  }

  @Post('addresses')
  createAddress(
    @Param('slug') slug: string,
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createAddressSchema)) dto: CreateAddressDto,
  ) {
    return this.accountService.createAddress(slug, user, dto);
  }

  @Patch('addresses/:addressId')
  updateAddress(
    @Param('slug') slug: string,
    @Param('addressId') addressId: string,
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(updateAddressSchema)) dto: UpdateAddressDto,
  ) {
    return this.accountService.updateAddress(slug, user, addressId, dto);
  }

  @Post('addresses/:addressId/default')
  setDefaultAddress(
    @Param('slug') slug: string,
    @Param('addressId') addressId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.accountService.setDefaultAddress(slug, user, addressId);
  }

  @Post('addresses/:addressId/revalidate')
  revalidateAddress(
    @Param('slug') slug: string,
    @Param('addressId') addressId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.accountService.revalidateAddressForStore(slug, user, addressId);
  }

  @Delete('addresses/:addressId')
  deleteAddress(
    @Param('slug') slug: string,
    @Param('addressId') addressId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.accountService.deleteAddress(slug, user, addressId);
  }
}
