import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { Role } from '../../generated/prisma';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import {
  addSubscriptionNoteSchema,
  cancelSubscriptionSchema,
  changePackageSchema,
  exportSubscriptionsQuerySchema,
  extendSubscriptionSchema,
  listSubscriptionsQuerySchema,
  subscriptionsAnalyticsQuerySchema,
  suspendSubscriptionSchema,
  updatePaymentStatusSchema,
} from './dto/subscriptions.schemas';
import type {
  AddSubscriptionNoteDto,
  CancelSubscriptionDto,
  ChangePackageDto,
  ExportSubscriptionsQueryDto,
  ExtendSubscriptionDto,
  ListSubscriptionsQueryDto,
  SubscriptionsAnalyticsQueryDto,
  SuspendSubscriptionDto,
  UpdatePaymentStatusDto,
} from './dto/subscriptions.schemas';

@Controller('admin/subscriptions')
@Roles(Role.SUPER_ADMIN)
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(listSubscriptionsQuerySchema))
    query: ListSubscriptionsQueryDto,
  ) {
    return this.subscriptionsService.list(query);
  }

  @Get('summary')
  summary(
    @Query(new ZodValidationPipe(listSubscriptionsQuerySchema.omit({ sortBy: true, sortDir: true, page: true, pageSize: true })))
    query: Omit<ListSubscriptionsQueryDto, 'sortBy' | 'sortDir' | 'page' | 'pageSize'>,
  ) {
    return this.subscriptionsService.summary(query);
  }

  @Get('analytics')
  analytics(
    @Query(new ZodValidationPipe(subscriptionsAnalyticsQuerySchema))
    query: SubscriptionsAnalyticsQueryDto,
  ) {
    return this.subscriptionsService.analytics(query);
  }

  @Get('export')
  exportData(
    @Query(new ZodValidationPipe(exportSubscriptionsQuerySchema))
    query: ExportSubscriptionsQueryDto,
  ) {
    return this.subscriptionsService.exportData(query);
  }

  @Get(':id')
  getDetail(@Param('id') id: string) {
    return this.subscriptionsService.getDetail(id);
  }

  @Get(':id/invoices/:invoiceId')
  getInvoice(@Param('id') id: string, @Param('invoiceId') invoiceId: string) {
    return this.subscriptionsService.getInvoice(id, invoiceId);
  }

  @Post(':id/renew')
  renew(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.subscriptionsService.renew(id, user.id);
  }

  @Patch(':id/extend')
  extend(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(extendSubscriptionSchema)) dto: ExtendSubscriptionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.subscriptionsService.extend(id, dto, user.id);
  }

  @Patch(':id/package')
  changePackage(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(changePackageSchema)) dto: ChangePackageDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.subscriptionsService.changePackage(id, dto, user.id);
  }

  @Patch(':id/suspend')
  suspend(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(suspendSubscriptionSchema)) dto: SuspendSubscriptionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.subscriptionsService.suspend(id, dto, user.id);
  }

  @Patch(':id/reactivate')
  reactivate(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.subscriptionsService.reactivate(id, user.id);
  }

  @Patch(':id/cancel')
  cancel(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(cancelSubscriptionSchema)) dto: CancelSubscriptionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.subscriptionsService.cancel(id, dto, user.id);
  }

  @Patch(':id/payment-status')
  updatePaymentStatus(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updatePaymentStatusSchema)) dto: UpdatePaymentStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.subscriptionsService.updatePaymentStatus(id, dto, user.id);
  }

  @Post(':id/notes')
  addNote(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(addSubscriptionNoteSchema)) dto: AddSubscriptionNoteDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.subscriptionsService.addNote(id, dto, user.id);
  }
}
