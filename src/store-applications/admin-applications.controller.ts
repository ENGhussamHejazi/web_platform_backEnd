import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { StoreApplicationsService } from './store-applications.service';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { Role } from '../../generated/prisma';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import {
  listApplicationsQuerySchema,
  rejectApplicationSchema,
  requestChangesSchema,
  suspendApplicationSchema,
} from './dto/store-applications.schemas';
import type {
  ListApplicationsQueryDto,
  RejectApplicationDto,
  RequestChangesDto,
  SuspendApplicationDto,
} from './dto/store-applications.schemas';

@Controller('admin/store-applications')
@Roles(Role.SUPER_ADMIN)
export class AdminApplicationsController {
  constructor(private readonly service: StoreApplicationsService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(listApplicationsQuerySchema))
    query: ListApplicationsQueryDto,
  ) {
    return this.service.listForAdmin(query);
  }

  @Get(':applicationId')
  get(@Param('applicationId') id: string) {
    return this.service.getForAdmin(id);
  }

  @Get(':applicationId/history')
  history(@Param('applicationId') id: string) {
    return this.service.getHistory(id);
  }

  @Post(':applicationId/start-review')
  startReview(
    @Param('applicationId') id: string,
    @CurrentUser() admin: AuthUser,
  ) {
    return this.service.startReview(id, admin.id);
  }

  @Post(':applicationId/approve')
  approve(@Param('applicationId') id: string, @CurrentUser() admin: AuthUser) {
    return this.service.approve(id, admin.id);
  }

  @Post(':applicationId/request-changes')
  requestChanges(
    @Param('applicationId') id: string,
    @CurrentUser() admin: AuthUser,
    @Body(new ZodValidationPipe(requestChangesSchema)) dto: RequestChangesDto,
  ) {
    return this.service.requestChanges(id, admin.id, dto);
  }

  @Post(':applicationId/reject')
  reject(
    @Param('applicationId') id: string,
    @CurrentUser() admin: AuthUser,
    @Body(new ZodValidationPipe(rejectApplicationSchema))
    dto: RejectApplicationDto,
  ) {
    return this.service.reject(id, admin.id, dto);
  }

  @Post(':applicationId/suspend')
  suspend(
    @Param('applicationId') id: string,
    @CurrentUser() admin: AuthUser,
    @Body(new ZodValidationPipe(suspendApplicationSchema))
    dto: SuspendApplicationDto,
  ) {
    return this.service.suspend(id, admin.id, dto);
  }
}
