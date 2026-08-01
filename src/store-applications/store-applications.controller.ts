import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { StoreApplicationsService } from './store-applications.service';
import { StorageService, MAX_IMAGE_BYTES } from '../storage/storage.service';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { Role } from '../../generated/prisma';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import {
  addDocumentBodySchema,
  patchApplicationSchema,
} from './dto/store-applications.schemas';
import type {
  AddDocumentBodyDto,
  PatchApplicationDto,
} from './dto/store-applications.schemas';

// Deliberately NOT gated by @RequireActiveStore — a merchant must be able to
// view/edit/submit their application precisely while their store is still
// PENDING (that's the whole point of this workflow).
@Controller('merchant/application')
@Roles(Role.MERCHANT)
export class MerchantApplicationController {
  constructor(
    private readonly service: StoreApplicationsService,
    private readonly storage: StorageService,
  ) {}

  @Get()
  get(@CurrentUser() user: AuthUser) {
    return this.service.getOwnApplication(user.id);
  }

  @Get('status')
  status(@CurrentUser() user: AuthUser) {
    return this.service.getOwnStatus(user.id);
  }

  @Delete()
  cancel(@CurrentUser() user: AuthUser) {
    return this.service.cancelOwnApplication(user.id);
  }

  @Patch()
  patch(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(patchApplicationSchema))
    dto: PatchApplicationDto,
  ) {
    return this.service.patchOwnApplication(user.id, dto);
  }

  @HttpCode(200)
  @Post('submit')
  submit(@CurrentUser() user: AuthUser) {
    return this.service.submit(user.id);
  }

  @HttpCode(200)
  @Post('resubmit')
  resubmit(@CurrentUser() user: AuthUser) {
    return this.service.resubmit(user.id);
  }

  @Post('documents')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_IMAGE_BYTES },
    }),
  )
  async addDocument(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
    @Body(new ZodValidationPipe(addDocumentBodySchema)) dto: AddDocumentBodyDto,
  ) {
    const uploaded = await this.storage.uploadImage(file, 'documents');
    return this.service.addDocument(user.id, dto, uploaded);
  }

  @Delete('documents/:documentId')
  removeDocument(
    @CurrentUser() user: AuthUser,
    @Param('documentId') documentId: string,
  ) {
    return this.service.removeDocument(user.id, documentId);
  }
}
