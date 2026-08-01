import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { InfrastructureService } from './infrastructure.service';
import { MonitoringController } from './monitoring.controller';
import { MonitoringMiddleware } from './monitoring.middleware';
import { MonitoringService } from './monitoring.service';

@Module({ controllers: [MonitoringController], providers: [MonitoringService, InfrastructureService] })
export class MonitoringModule implements NestModule {
  configure(consumer: MiddlewareConsumer) { consumer.apply(MonitoringMiddleware).forRoutes('*'); }
}
