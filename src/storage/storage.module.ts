import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CloudinaryStorage } from './cloudinary.storage';
import { LocalStorage } from './local.storage';
import { STORAGE_DRIVER } from './storage.interface';
import { StorageController } from './storage.controller';
import { StorageService } from './storage.service';

/**
 * Picks the storage driver from STORAGE_DRIVER at boot. Global so any feature
 * module (products, stores) can inject StorageService without re-importing.
 */
@Global()
@Module({
  controllers: [StorageController],
  providers: [
    StorageService,
    {
      provide: STORAGE_DRIVER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const driver = config.get<string>('storage.driver') ?? 'local';
        if (driver !== 'cloudinary') {
          return new LocalStorage(config);
        }

        // Fail loudly at boot rather than on the merchant's first upload.
        const missing = ['cloudName', 'apiKey', 'apiSecret'].filter(
          (k) => !config.get<string>(`storage.cloudinary.${k}`),
        );
        if (missing.length > 0) {
          throw new Error(
            `STORAGE_DRIVER=cloudinary but missing config: ${missing.join(', ')}. ` +
              'Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.',
          );
        }
        Logger.log('تخزين الصور: Cloudinary', 'StorageModule');
        return new CloudinaryStorage(config);
      },
    },
  ],
  exports: [StorageService],
})
export class StorageModule {}
