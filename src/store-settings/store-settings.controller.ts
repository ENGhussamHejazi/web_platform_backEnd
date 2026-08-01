import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { StoreSettingsService } from './store-settings.service';
import { Roles } from '../common/decorators/roles.decorator';
import { RequireActiveStore } from '../common/decorators/require-active-store.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { Role } from '../../generated/prisma';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import {
  announcementSchema,
  homepageSectionSchema,
  updateAnnouncementSchema,
  updateHomepageSectionSchema,
  reorderHomepageSectionsSchema,
  updateStoreSettingsSchema,
} from './dto/store-settings.schemas';
import type {
  AnnouncementDto,
  HomepageSectionDto,
  UpdateAnnouncementDto,
  UpdateHomepageSectionDto,
  ReorderHomepageSectionsDto,
  UpdateStoreSettingsDto,
} from './dto/store-settings.schemas';

@Controller('merchant/store')
@Roles(Role.MERCHANT)
@RequireActiveStore()
export class StoreSettingsController {
  constructor(private readonly storeSettingsService: StoreSettingsService) {}

  private storeIdOf(user: AuthUser): string {
    if (!user.storeId) {
      throw new ForbiddenException('لا يوجد متجر مرتبط بهذا الحساب');
    }
    return user.storeId;
  }

  @Get()
  get(@CurrentUser() user: AuthUser) {
    return this.storeSettingsService.get(this.storeIdOf(user));
  }

  @Patch()
  update(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(updateStoreSettingsSchema))
    dto: UpdateStoreSettingsDto,
  ) {
    return this.storeSettingsService.update(this.storeIdOf(user), dto);
  }

  @Get('announcements')
  listAnnouncements(@CurrentUser() user: AuthUser) {
    return this.storeSettingsService.listAnnouncements(this.storeIdOf(user));
  }

  @Post('announcements')
  createAnnouncement(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(announcementSchema)) dto: AnnouncementDto,
  ) {
    return this.storeSettingsService.createAnnouncement(
      this.storeIdOf(user),
      dto,
    );
  }

  @Patch('announcements/:id')
  updateAnnouncement(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateAnnouncementSchema))
    dto: UpdateAnnouncementDto,
  ) {
    return this.storeSettingsService.updateAnnouncement(
      this.storeIdOf(user),
      id,
      dto,
    );
  }

  @Delete('announcements/:id')
  deleteAnnouncement(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.storeSettingsService.deleteAnnouncement(
      this.storeIdOf(user),
      id,
    );
  }

  @Get('homepage-sections')
  listHomepageSections(@CurrentUser() user: AuthUser) {
    return this.storeSettingsService.listHomepageSections(this.storeIdOf(user));
  }

  @Post('homepage-sections')
  createHomepageSection(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(homepageSectionSchema))
    dto: HomepageSectionDto,
  ) {
    return this.storeSettingsService.createHomepageSection(
      this.storeIdOf(user),
      dto,
    );
  }

  @Patch('homepage-sections/reorder')
  reorderHomepageSections(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(reorderHomepageSectionsSchema))
    dto: ReorderHomepageSectionsDto,
  ) {
    return this.storeSettingsService.reorderHomepageSections(
      this.storeIdOf(user),
      dto,
    );
  }

  @Patch('homepage-sections/:id')
  updateHomepageSection(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateHomepageSectionSchema))
    dto: UpdateHomepageSectionDto,
  ) {
    return this.storeSettingsService.updateHomepageSection(
      this.storeIdOf(user),
      id,
      dto,
    );
  }

  @Delete('homepage-sections/:id')
  deleteHomepageSection(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.storeSettingsService.deleteHomepageSection(
      this.storeIdOf(user),
      id,
    );
  }
}
