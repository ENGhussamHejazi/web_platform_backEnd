import { Controller, Get, Header, Query } from '@nestjs/common';
import { Role } from '../../generated/prisma';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { monitoringErrorsQuerySchema, type MonitoringErrorsQueryDto } from './dto/monitoring.schemas';
import { InfrastructureService } from './infrastructure.service';
import { MonitoringService } from './monitoring.service';

@Controller('monitoring')
export class MonitoringController {
  constructor(
    private readonly monitoring: MonitoringService,
    private readonly infrastructure: InfrastructureService,
  ) {}

  @Get('health') @Public()
  async health() { const data = await this.monitoring.summary(); return { status: data.status, checkedAt: data.checkedAt, services: data.services }; }

  @Get('metrics') @Public() @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  metrics() { return this.monitoring.prometheus(); }

  @Get('summary') @Roles(Role.SUPER_ADMIN)
  summary() { return this.monitoring.summary(); }

  @Get('history') @Roles(Role.SUPER_ADMIN)
  history() { return this.monitoring.history(); }

  @Get('routes') @Roles(Role.SUPER_ADMIN)
  routes() { return this.monitoring.routes(); }

  @Get('errors') @Roles(Role.SUPER_ADMIN)
  errors(@Query(new ZodValidationPipe(monitoringErrorsQuerySchema)) query: MonitoringErrorsQueryDto) {
    return this.monitoring.errorLogs(query.limit, query.before);
  }

  @Get('database') @Roles(Role.SUPER_ADMIN)
  database() { return this.infrastructure.database(); }

  @Get('cloudinary') @Roles(Role.SUPER_ADMIN)
  cloudinaryUsage() { return this.infrastructure.cloudinaryUsage(); }
}
