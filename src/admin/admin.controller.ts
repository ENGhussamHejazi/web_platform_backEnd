import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { PlansService } from '../plans/plans.service';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { Role } from '../../generated/prisma';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import {
  adminSearchQuerySchema,
  createPlanSchema,
  dashboardQuerySchema,
  listAdminCustomersQuerySchema,
  listStoresQuerySchema,
  updatePlanSchema,
  updateStorePlanSchema,
  updateStoreStatusSchema,
  updateStoreVerifiedSchema,
} from './dto/admin.schemas';
import type {
  AdminSearchQueryDto,
  CreatePlanDto,
  DashboardQueryDto,
  ListAdminCustomersQueryDto,
  ListStoresQueryDto,
  UpdatePlanDto,
  UpdateStorePlanDto,
  UpdateStoreStatusDto,
  UpdateStoreVerifiedDto,
} from './dto/admin.schemas';
import { sendMessageSchema } from '../messaging/dto/messaging.schemas';
import type { SendMessageDto } from '../messaging/dto/messaging.schemas';

@Controller('admin')
@Roles(Role.SUPER_ADMIN)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly plansService: PlansService,
  ) {}

  @Get('analytics')
  analytics() {
    return this.adminService.analytics();
  }

  @Get('dashboard')
  dashboard(
    @Query(new ZodValidationPipe(dashboardQuerySchema))
    query: DashboardQueryDto,
  ) {
    return this.adminService.dashboard(query);
  }

  @Get('search')
  search(
    @Query(new ZodValidationPipe(adminSearchQuerySchema))
    query: AdminSearchQueryDto,
  ) {
    return this.adminService.search(query);
  }

  @Get('reports')
  reports() {
    return this.adminService.reports();
  }

  @Get('platform-report')
  platformReport() {
    return this.adminService.platformReport();
  }

  @Get('stores')
  listStores(
    @Query(new ZodValidationPipe(listStoresQuerySchema))
    query: ListStoresQueryDto,
  ) {
    return this.adminService.listStores(query);
  }

  @Get('stores/:id')
  getStore(@Param('id') id: string) {
    return this.adminService.getStore(id);
  }

  @Patch('stores/:id/status')
  updateStatus(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateStoreStatusSchema))
    dto: UpdateStoreStatusDto,
  ) {
    return this.adminService.updateStatus(id, dto);
  }

  @Get('stores/:id/messages')
  listMessages(@Param('id') id: string) {
    return this.adminService.listMessages(id);
  }

  @Post('stores/:id/messages')
  sendMessage(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(sendMessageSchema)) dto: SendMessageDto,
  ) {
    return this.adminService.sendMessage(id, user.id, dto.body);
  }

  @Get('messages/unread-counts')
  messageUnreadCounts() {
    return this.adminService.messageUnreadCounts();
  }

  @Get('messages/summary')
  messageSummary() {
    return this.adminService.messageSummary();
  }

  @Patch('stores/:id/verified')
  updateStoreVerified(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateStoreVerifiedSchema))
    dto: UpdateStoreVerifiedDto,
  ) {
    return this.adminService.updateVerified(id, dto);
  }

  @Patch('stores/:id/plan')
  updateStorePlan(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateStorePlanSchema))
    dto: UpdateStorePlanDto,
  ) {
    return this.adminService.updatePlan(id, dto);
  }

  @Get('plans')
  listPlans() {
    return this.plansService.listAll();
  }

  @Post('plans')
  createPlan(
    @Body(new ZodValidationPipe(createPlanSchema)) dto: CreatePlanDto,
  ) {
    return this.plansService.create(dto);
  }

  @Patch('plans/:id')
  updatePlan(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updatePlanSchema)) dto: UpdatePlanDto,
  ) {
    return this.plansService.update(id, dto);
  }

  @Delete('plans/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deletePlan(@Param('id') id: string) {
    return this.plansService.remove(id);
  }

  @Get('customers')
  listCustomers(
    @Query(new ZodValidationPipe(listAdminCustomersQuerySchema))
    query: ListAdminCustomersQueryDto,
  ) {
    return this.adminService.listCustomers(query);
  }

  @Get('customers/:id')
  getCustomer(@Param('id') id: string) {
    return this.adminService.getCustomer(id);
  }
}
