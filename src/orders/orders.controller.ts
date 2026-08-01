import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Delete,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { OrdersService } from './orders.service';
import { StorageService, MAX_IMAGE_BYTES } from '../storage/storage.service';
import { Roles } from '../common/decorators/roles.decorator';
import { RequireActiveStore } from '../common/decorators/require-active-store.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { Role } from '../../generated/prisma';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import {
  assignDriverSchema,
  createOrderNoteSchema,
  createRefundSchema,
  createReturnSchema,
  listOrdersQuerySchema,
  listReturnsQuerySchema,
  reportDeliveryFailureSchema,
  updateOrderNoteSchema,
  updateOrderStatusSchema,
  updatePaymentSchema,
  updateReturnSchema,
} from './dto/orders.schemas';
import type {
  AssignDriverDto,
  CreateOrderNoteDto,
  CreateRefundDto,
  CreateReturnDto,
  ListOrdersQueryDto,
  ListReturnsQueryDto,
  ReportDeliveryFailureDto,
  UpdateOrderNoteDto,
  UpdateOrderStatusDto,
  UpdatePaymentDto,
  UpdateReturnDto,
} from './dto/orders.schemas';

@Controller('merchant/orders')
@Roles(Role.MERCHANT)
@RequireActiveStore()
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly storage: StorageService,
  ) {}

  private storeIdOf(user: AuthUser): string {
    if (!user.storeId) {
      throw new ForbiddenException('لا يوجد متجر مرتبط بهذا الحساب');
    }
    return user.storeId;
  }

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(listOrdersQuerySchema))
    query: ListOrdersQueryDto,
  ) {
    return this.ordersService.list(this.storeIdOf(user), query);
  }

  @Get('returns')
  listReturns(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(listReturnsQuerySchema))
    query: ListReturnsQueryDto,
  ) {
    return this.ordersService.listReturns(this.storeIdOf(user), query);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.ordersService.get(this.storeIdOf(user), id);
  }

  @Get(':id/invoice')
  getInvoice(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.ordersService.getInvoice(this.storeIdOf(user), id);
  }

  @Patch(':id/status')
  updateStatus(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateOrderStatusSchema))
    dto: UpdateOrderStatusDto,
  ) {
    return this.ordersService.updateStatus(
      this.storeIdOf(user),
      id,
      dto,
      user.id,
    );
  }

  @Post(':id/notes')
  addNote(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createOrderNoteSchema)) dto: CreateOrderNoteDto,
  ) {
    return this.ordersService.addNote(this.storeIdOf(user), id, user.id, dto);
  }

  @Patch(':id/notes/:noteId')
  updateNote(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('noteId') noteId: string,
    @Body(new ZodValidationPipe(updateOrderNoteSchema)) dto: UpdateOrderNoteDto,
  ) {
    return this.ordersService.updateNote(
      this.storeIdOf(user),
      id,
      noteId,
      user.id,
      dto,
    );
  }

  @Delete(':id/notes/:noteId')
  deleteNote(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('noteId') noteId: string,
  ) {
    return this.ordersService.deleteNote(
      this.storeIdOf(user),
      id,
      noteId,
      user.id,
    );
  }

  @Post(':id/note-attachment')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_IMAGE_BYTES },
    }),
  )
  async uploadNoteAttachment(@UploadedFile() file: Express.Multer.File) {
    const stored = await this.storage.uploadImage(file, 'order-notes');
    return stored;
  }

  @Post(':id/assign-driver')
  assignDriver(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(assignDriverSchema)) dto: AssignDriverDto,
  ) {
    return this.ordersService.assignDriver(
      this.storeIdOf(user),
      id,
      user.id,
      dto,
    );
  }

  @Post(':id/picked-up')
  markPickedUp(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.ordersService.markPickedUp(this.storeIdOf(user), id, user.id);
  }

  @Post(':id/delivery-failure')
  reportDeliveryFailure(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(reportDeliveryFailureSchema))
    dto: ReportDeliveryFailureDto,
  ) {
    return this.ordersService.reportDeliveryFailure(
      this.storeIdOf(user),
      id,
      user.id,
      dto,
    );
  }

  @Patch(':id/payment')
  updatePayment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updatePaymentSchema)) dto: UpdatePaymentDto,
  ) {
    return this.ordersService.updatePayment(
      this.storeIdOf(user),
      id,
      user.id,
      dto,
    );
  }

  @Post(':id/payment-proof')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_IMAGE_BYTES },
    }),
  )
  async uploadPaymentProof(@UploadedFile() file: Express.Multer.File) {
    const stored = await this.storage.uploadImage(file, 'payment-proofs');
    return stored;
  }

  @Post(':id/returns')
  createReturn(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createReturnSchema)) dto: CreateReturnDto,
  ) {
    return this.ordersService.createReturn(
      this.storeIdOf(user),
      id,
      user.id,
      dto,
    );
  }

  @Patch(':id/returns/:returnId')
  updateReturn(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('returnId') returnId: string,
    @Body(new ZodValidationPipe(updateReturnSchema)) dto: UpdateReturnDto,
  ) {
    return this.ordersService.updateReturn(
      this.storeIdOf(user),
      id,
      returnId,
      user.id,
      dto,
    );
  }

  @Post(':id/returns/:returnId/images')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_IMAGE_BYTES },
    }),
  )
  async uploadReturnImage(@UploadedFile() file: Express.Multer.File) {
    const stored = await this.storage.uploadImage(file, 'return-images');
    return stored;
  }

  @Post(':id/refunds')
  createRefund(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createRefundSchema)) dto: CreateRefundDto,
  ) {
    return this.ordersService.createRefund(
      this.storeIdOf(user),
      id,
      user.id,
      dto,
    );
  }
}
