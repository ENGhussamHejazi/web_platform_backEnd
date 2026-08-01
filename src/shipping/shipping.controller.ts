import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ShippingService } from './shipping.service';
import { Roles } from '../common/decorators/roles.decorator';
import { RequireActiveStore } from '../common/decorators/require-active-store.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { Governorate, Role } from '../../generated/prisma';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import {
  GOVERNORATE_VALUES,
  bulkCityRateSchema,
  cityRateSchema,
  copyCityRatesSchema,
  setShippingZoneSchema,
} from './dto/shipping.schemas';
import type {
  BulkCityRateDto,
  CityRateDto,
  CopyCityRatesDto,
  SetShippingZoneDto,
} from './dto/shipping.schemas';

@Controller('merchant/shipping-zones')
@Roles(Role.MERCHANT)
@RequireActiveStore()
export class ShippingController {
  constructor(private readonly shippingService: ShippingService) {}

  private storeIdOf(user: AuthUser): string {
    if (!user.storeId) {
      throw new ForbiddenException('لا يوجد متجر مرتبط بهذا الحساب');
    }
    return user.storeId;
  }

  private assertValidGovernorate(governorate: string) {
    if (
      !GOVERNORATE_VALUES.includes(
        governorate as (typeof GOVERNORATE_VALUES)[number],
      )
    ) {
      throw new BadRequestException('محافظة غير صالحة');
    }
  }

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.shippingService.list(this.storeIdOf(user));
  }

  @Put(':governorate')
  set(
    @CurrentUser() user: AuthUser,
    @Param('governorate') governorate: string,
    @Body(new ZodValidationPipe(setShippingZoneSchema)) dto: SetShippingZoneDto,
  ) {
    this.assertValidGovernorate(governorate);
    return this.shippingService.set(
      this.storeIdOf(user),
      governorate,
      dto.cost,
    );
  }

  @Delete(':governorate')
  remove(
    @CurrentUser() user: AuthUser,
    @Param('governorate') governorate: string,
  ) {
    this.assertValidGovernorate(governorate);
    return this.shippingService.remove(this.storeIdOf(user), governorate);
  }

  @Patch('cities/bulk')
  bulkSetCityRates(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(bulkCityRateSchema)) dto: BulkCityRateDto,
  ) {
    return this.shippingService.bulkSetCityRates(this.storeIdOf(user), dto);
  }

  @Post('cities/copy')
  copyRates(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(copyCityRatesSchema)) dto: CopyCityRatesDto,
  ) {
    return this.shippingService.copyRates(
      this.storeIdOf(user),
      dto.sourceCityId,
      dto.targetCityIds,
    );
  }

  @Get(':governorate/cities')
  listCities(
    @CurrentUser() user: AuthUser,
    @Param('governorate') governorate: string,
    @Query('search') search?: string,
  ) {
    this.assertValidGovernorate(governorate);
    return this.shippingService.listCitiesForGovernorate(
      this.storeIdOf(user),
      governorate as Governorate,
      search,
    );
  }

  @Put(':governorate/cities/:cityId')
  setCityRate(
    @CurrentUser() user: AuthUser,
    @Param('governorate') governorate: string,
    @Param('cityId') cityId: string,
    @Body(new ZodValidationPipe(cityRateSchema)) dto: CityRateDto,
  ) {
    this.assertValidGovernorate(governorate);
    return this.shippingService.setCityRate(
      this.storeIdOf(user),
      governorate as Governorate,
      cityId,
      dto,
    );
  }

  @Delete(':governorate/cities/:cityId')
  removeCityRate(
    @CurrentUser() user: AuthUser,
    @Param('governorate') governorate: string,
    @Param('cityId') cityId: string,
  ) {
    this.assertValidGovernorate(governorate);
    return this.shippingService.removeCityRate(
      this.storeIdOf(user),
      governorate as Governorate,
      cityId,
    );
  }
}
