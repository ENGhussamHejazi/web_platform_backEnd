import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { StorefrontService } from './storefront.service';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { Role } from '../../generated/prisma';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import {
  createReviewSchema,
  listReviewsQuerySchema,
} from './dto/storefront.schemas';
import type {
  CreateReviewDto,
  ListReviewsQueryDto,
} from './dto/storefront.schemas';

// Deliberately a separate controller from StorefrontController: that one is
// @Public() at the class level, which would leak into every route here.
// Only the list endpoint below opts back into being public.
@Controller('public/stores/:slug/products/:productId/reviews')
export class ReviewsController {
  constructor(private readonly storefrontService: StorefrontService) {}

  @Public()
  @Get()
  list(
    @Param('slug') slug: string,
    @Param('productId') productId: string,
    @Query(new ZodValidationPipe(listReviewsQuerySchema))
    query: ListReviewsQueryDto,
  ) {
    return this.storefrontService.listProductReviews(slug, productId, query);
  }

  @Roles(Role.CUSTOMER)
  @Get('me')
  getMyStatus(
    @Param('slug') slug: string,
    @Param('productId') productId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.storefrontService.getMyReviewStatus(slug, productId, user);
  }

  @Roles(Role.CUSTOMER)
  @Post()
  upsert(
    @Param('slug') slug: string,
    @Param('productId') productId: string,
    @Body(new ZodValidationPipe(createReviewSchema)) dto: CreateReviewDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.storefrontService.upsertReview(slug, productId, user, dto);
  }

  @Roles(Role.CUSTOMER)
  @Delete('me')
  deleteMine(
    @Param('slug') slug: string,
    @Param('productId') productId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.storefrontService.deleteMyReview(slug, productId, user);
  }
}
