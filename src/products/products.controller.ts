import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ProductsService } from './products.service';
import { Roles } from '../common/decorators/roles.decorator';
import { RequireActiveStore } from '../common/decorators/require-active-store.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { Role } from '../../generated/prisma';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import {
  createCategorySchema,
  createProductSchema,
  listProductsQuerySchema,
  updateCategorySchema,
  reorderCategoriesSchema,
  updateProductSchema,
} from './dto/products.schemas';
import type {
  CreateCategoryDto,
  CreateProductDto,
  ListProductsQueryDto,
  UpdateCategoryDto,
  ReorderCategoriesDto,
  UpdateProductDto,
} from './dto/products.schemas';

@Controller('merchant/products')
@Roles(Role.MERCHANT)
@RequireActiveStore()
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  private storeIdOf(user: AuthUser): string {
    if (!user.storeId) {
      throw new ForbiddenException('لا يوجد متجر مرتبط بهذا الحساب');
    }
    return user.storeId;
  }

  @Get('categories')
  listCategories(@CurrentUser() user: AuthUser) {
    return this.productsService.listCategories(this.storeIdOf(user));
  }

  @Post('categories')
  createCategory(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createCategorySchema)) dto: CreateCategoryDto,
  ) {
    return this.productsService.createCategory(this.storeIdOf(user), dto);
  }

  @Patch('categories/reorder')
  reorderCategories(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(reorderCategoriesSchema)) dto: ReorderCategoriesDto,
  ) {
    return this.productsService.reorderCategories(this.storeIdOf(user), dto);
  }

  @Patch('categories/:id')
  updateCategory(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateCategorySchema)) dto: UpdateCategoryDto,
  ) {
    return this.productsService.updateCategory(this.storeIdOf(user), id, dto);
  }

  @Delete('categories/:id')
  removeCategory(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.productsService.removeCategory(this.storeIdOf(user), id);
  }

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(listProductsQuerySchema))
    query: ListProductsQueryDto,
  ) {
    return this.productsService.list(this.storeIdOf(user), query);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.productsService.get(this.storeIdOf(user), id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createProductSchema)) dto: CreateProductDto,
  ) {
    return this.productsService.create(this.storeIdOf(user), dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateProductSchema)) dto: UpdateProductDto,
  ) {
    return this.productsService.update(this.storeIdOf(user), id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.productsService.remove(this.storeIdOf(user), id);
  }
}
