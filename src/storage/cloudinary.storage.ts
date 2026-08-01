import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import { StorageDriver, StoredFile } from './storage.interface';

/**
 * Uploads through the backend rather than straight from the browser, so the
 * API secret never leaves the server and every file passes our auth + MIME
 * checks before it reaches Cloudinary.
 */
@Injectable()
export class CloudinaryStorage implements StorageDriver {
  private readonly logger = new Logger(CloudinaryStorage.name);

  constructor(private readonly config: ConfigService) {
    cloudinary.config({
      cloud_name: this.config.get<string>('storage.cloudinary.cloudName'),
      api_key: this.config.get<string>('storage.cloudinary.apiKey'),
      api_secret: this.config.get<string>('storage.cloudinary.apiSecret'),
      secure: true,
    });
  }

  async upload(file: Express.Multer.File, folder: string): Promise<StoredFile> {
    const root =
      this.config.get<string>('storage.cloudinary.folder') ?? 'souq-syria';

    const result = await new Promise<UploadApiResponse>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: `${root}/${folder}`,
          resource_type: 'image',
          // Strip metadata and let Cloudinary pick the best format/quality per
          // client — Syrian mobile connections are often slow.
          transformation: [{ quality: 'auto', fetch_format: 'auto' }],
        },
        (error, uploaded) => {
          if (error || !uploaded) {
            return reject(error ?? new Error('Cloudinary returned no result'));
          }
          resolve(uploaded);
        },
      );
      stream.end(file.buffer);
    }).catch((error: Error) => {
      this.logger.error(`فشل رفع الصورة إلى Cloudinary: ${error.message}`);
      throw new InternalServerErrorException('تعذّر رفع الصورة، حاول مرة أخرى');
    });

    return { url: result.secure_url, publicId: result.public_id };
  }

  async delete(publicId: string): Promise<void> {
    try {
      await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
    } catch (error) {
      // A failed remote delete must not block deleting our own DB row.
      this.logger.warn(
        `تعذّر حذف الصورة ${publicId} من Cloudinary: ${(error as Error).message}`,
      );
    }
  }
}
