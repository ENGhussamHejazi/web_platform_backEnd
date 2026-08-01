import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { STORAGE_DRIVER } from './storage.interface';
import type { StorageDriver, StoredFile } from './storage.interface';

/** Max accepted image size. Kept modest — most listings are phone photos. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
];

/**
 * The client-supplied `mimetype` is just a header the client chose to send —
 * trusting it let a `.php` payload through wearing an `image/png` label (see
 * security review). Check the file's actual magic bytes instead of trusting
 * anything the caller claims.
 */
function sniffImageType(buffer: Buffer): string | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 4, 8) === 'ftyp' &&
    ['avif', 'avis'].includes(buffer.toString('ascii', 8, 12))
  ) {
    return 'image/avif';
  }
  return null;
}

/**
 * Driver-agnostic entry point for image storage. Callers depend on this, never
 * on a concrete driver, so switching STORAGE_DRIVER needs no code changes.
 */
@Injectable()
export class StorageService {
  constructor(@Inject(STORAGE_DRIVER) private readonly driver: StorageDriver) {}

  async uploadImage(
    file: Express.Multer.File,
    folder: string,
  ): Promise<StoredFile> {
    if (!file) {
      throw new BadRequestException('لم يتم إرسال أي ملف');
    }
    if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        'صيغة الصورة غير مدعومة (JPEG, PNG, WebP, AVIF)',
      );
    }
    if (file.size > MAX_IMAGE_BYTES) {
      throw new BadRequestException('حجم الصورة يتجاوز 5 ميغابايت');
    }
    const actualType = sniffImageType(file.buffer);
    if (!actualType || !ALLOWED_IMAGE_TYPES.includes(actualType)) {
      throw new BadRequestException('محتوى الملف لا يطابق صيغة صورة مدعومة');
    }
    return this.driver.upload(file, folder);
  }

  async uploadImages(
    files: Express.Multer.File[],
    folder: string,
  ): Promise<StoredFile[]> {
    return Promise.all(files.map((file) => this.uploadImage(file, folder)));
  }

  async deleteImage(publicId: string): Promise<void> {
    return this.driver.delete(publicId);
  }
}
