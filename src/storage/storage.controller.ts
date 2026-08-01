import {
  BadRequestException,
  Controller,
  Delete,
  ForbiddenException,
  Post,
  Query,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Role } from '../../generated/prisma';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { MAX_IMAGE_BYTES, StorageService } from './storage.service';

/** Upload targets merchants are allowed to write to. */
const ALLOWED_FOLDERS = ['products', 'stores', 'categories'];

const MAX_FILES_PER_REQUEST = 10;

/**
 * Every publicId this controller hands out is namespaced `folder/scope/name`,
 * where `scope` is the uploading store (or the admin's own user id, for
 * SUPER_ADMIN uploads not tied to a store). Image URLs are inherently public
 * on an e-commerce site — anyone can copy one off a competitor's product page
 * — so ownership of the delete endpoint must be provable from the id itself,
 * not just "the caller is *a* merchant".
 */
function scopeOf(user: AuthUser): string {
  return user.storeId ?? user.id;
}

@Controller('uploads')
@Roles(Role.MERCHANT, Role.SUPER_ADMIN)
export class StorageController {
  constructor(private readonly storage: StorageService) {}

  /**
   * Accepts one or more images and returns their stored URLs. The caller then
   * persists those URLs (e.g. onto ProductImage) in a separate request.
   */
  @Post()
  @UseInterceptors(
    FilesInterceptor('files', MAX_FILES_PER_REQUEST, {
      // Buffer in memory: drivers stream straight to their destination, so
      // nothing needs to touch local disk.
      storage: memoryStorage(),
      limits: { fileSize: MAX_IMAGE_BYTES, files: MAX_FILES_PER_REQUEST },
    }),
  )
  async upload(
    @UploadedFiles() files: Express.Multer.File[],
    @Query('folder') folder = 'products',
    @CurrentUser() user: AuthUser,
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('لم يتم إرسال أي ملف');
    }
    if (!ALLOWED_FOLDERS.includes(folder)) {
      throw new BadRequestException('مجلد التخزين غير صالح');
    }
    const scopedFolder = `${folder}/${scopeOf(user)}`;
    return { images: await this.storage.uploadImages(files, scopedFolder) };
  }

  @Delete()
  async remove(
    @Query('publicId') publicId: string,
    @CurrentUser() user: AuthUser,
  ) {
    if (!publicId) {
      throw new BadRequestException('publicId مطلوب');
    }
    if (user.role !== Role.SUPER_ADMIN) {
      // Segment position varies by driver (Cloudinary prefixes a root
      // folder, local storage doesn't), so match the scope anywhere in the
      // path rather than at a fixed index.
      if (!publicId.split('/').includes(scopeOf(user))) {
        throw new ForbiddenException('لا تملك صلاحية حذف هذا الملف');
      }
    }
    await this.storage.deleteImage(publicId);
    return { deleted: true };
  }
}
