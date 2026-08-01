import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { LocationsService } from './locations.service';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../../generated/prisma';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import {
  bulkCreateCitiesSchema,
  createCitySchema,
  listCitiesQuerySchema,
  reorderCitiesSchema,
  updateCitySchema,
} from './dto/location.schemas';
import type {
  BulkCreateCitiesDto,
  CreateCityDto,
  ListCitiesQueryDto,
  ReorderCitiesDto,
  UpdateCityDto,
} from './dto/location.schemas';

@Controller('admin/cities')
@Roles(Role.SUPER_ADMIN)
export class AdminLocationsController {
  constructor(private readonly locations: LocationsService) {}

  @Get()
  list(@Query(new ZodValidationPipe(listCitiesQuerySchema)) query: ListCitiesQueryDto) {
    return this.locations.listAdmin(query);
  }

  @Post()
  create(@Body(new ZodValidationPipe(createCitySchema)) dto: CreateCityDto) {
    return this.locations.create(dto);
  }

  @Post('bulk')
  bulkCreate(@Body(new ZodValidationPipe(bulkCreateCitiesSchema)) dto: BulkCreateCitiesDto) {
    return this.locations.bulkCreate(dto);
  }

  @Patch('reorder')
  reorder(@Body(new ZodValidationPipe(reorderCitiesSchema)) dto: ReorderCitiesDto) {
    return this.locations.reorder(dto.governorate, dto.cityIds);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateCitySchema)) dto: UpdateCityDto,
  ) {
    return this.locations.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.locations.remove(id);
  }
}
