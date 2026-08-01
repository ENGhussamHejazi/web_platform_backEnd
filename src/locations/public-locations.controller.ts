import { BadRequestException, Controller, Get, Param } from '@nestjs/common';
import { LocationsService } from './locations.service';
import { Public } from '../common/decorators/public.decorator';
import { Governorate } from '../../generated/prisma';
import { GOVERNORATE_VALUES } from '../shipping/dto/shipping.schemas';

@Controller('locations')
@Public()
export class PublicLocationsController {
  constructor(private readonly locations: LocationsService) {}

  @Get('governorates/:governorate/cities')
  listCities(@Param('governorate') governorate: string) {
    if (!GOVERNORATE_VALUES.includes(governorate as (typeof GOVERNORATE_VALUES)[number])) {
      throw new BadRequestException('محافظة غير صالحة');
    }
    return this.locations.listActiveByGovernorate(governorate as Governorate);
  }
}
