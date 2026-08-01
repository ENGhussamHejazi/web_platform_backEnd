import { Module } from '@nestjs/common';
import { AdminLocationsController } from './admin-locations.controller';
import { PublicLocationsController } from './public-locations.controller';
import { LocationsService } from './locations.service';

@Module({
  controllers: [AdminLocationsController, PublicLocationsController],
  providers: [LocationsService],
  exports: [LocationsService],
})
export class LocationsModule {}
