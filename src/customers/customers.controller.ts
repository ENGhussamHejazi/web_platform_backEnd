import { Controller, ForbiddenException, Get, Param, Query } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { Roles } from '../common/decorators/roles.decorator';
import { RequireActiveStore } from '../common/decorators/require-active-store.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { Role } from '../../generated/prisma';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { listCustomersQuerySchema } from './dto/customers.schemas';
import type { ListCustomersQueryDto } from './dto/customers.schemas';

@Controller('merchant/customers')
@Roles(Role.MERCHANT)
@RequireActiveStore()
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  private storeIdOf(user: AuthUser): string {
    if (!user.storeId) {
      throw new ForbiddenException('لا يوجد متجر مرتبط بهذا الحساب');
    }
    return user.storeId;
  }

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(listCustomersQuerySchema))
    query: ListCustomersQueryDto,
  ) {
    return this.customersService.list(this.storeIdOf(user), query);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.customersService.get(this.storeIdOf(user), id);
  }
}
