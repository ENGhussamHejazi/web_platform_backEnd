import { Body, Controller, ForbiddenException, Get, Patch, Post } from '@nestjs/common';
import { StoreThemeService } from './store-theme.service';
import { Roles } from '../common/decorators/roles.decorator';
import { RequireActiveStore } from '../common/decorators/require-active-store.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { Role } from '../../generated/prisma';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { resetThemeSchema, updateThemeDraftSchema } from './dto/store-theme.schemas';
import type { ResetThemeDto, UpdateThemeDraftDto } from './dto/store-theme.schemas';

@Controller('merchant/store/theme')
@Roles(Role.MERCHANT)
@RequireActiveStore()
export class StoreThemeController {
  constructor(private readonly storeThemeService: StoreThemeService) {}

  private storeIdOf(user: AuthUser): string {
    if (!user.storeId) {
      throw new ForbiddenException('لا يوجد متجر مرتبط بهذا الحساب');
    }
    return user.storeId;
  }

  @Get()
  get(@CurrentUser() user: AuthUser) {
    return this.storeThemeService.get(this.storeIdOf(user));
  }

  @Get('templates')
  getTemplates() {
    return this.storeThemeService.getTemplates();
  }

  @Get('entitlements')
  getEntitlements(@CurrentUser() user: AuthUser) {
    return this.storeThemeService.getEntitlements(this.storeIdOf(user));
  }

  @Patch('draft')
  updateDraft(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(updateThemeDraftSchema)) dto: UpdateThemeDraftDto,
  ) {
    return this.storeThemeService.updateDraft(this.storeIdOf(user), dto);
  }

  @Post('publish')
  publish(@CurrentUser() user: AuthUser) {
    return this.storeThemeService.publish(this.storeIdOf(user));
  }

  @Post('reset')
  reset(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(resetThemeSchema)) dto: ResetThemeDto,
  ) {
    return this.storeThemeService.reset(this.storeIdOf(user), dto);
  }
}
