import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { mkdir, writeFile, unlink } from 'fs/promises';
import { extname, join, resolve, sep } from 'path';
import { StorageDriver, StoredFile } from './storage.interface';

const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif']);

/** Writes to UPLOAD_DIR on disk; served statically at /uploads/* (see main.ts). */
@Injectable()
export class LocalStorage implements StorageDriver {
  constructor(private readonly config: ConfigService) {}

  /**
   * Resolves `relative` against the upload root and rejects anything that
   * escapes it (e.g. `../../etc/passwd`) — the root is trusted, `relative`
   * never is, whether it comes from a freshly generated name or a
   * client-supplied publicId on delete.
   */
  private resolveWithinUploadDir(uploadDir: string, relative: string): string {
    const root = resolve(process.cwd(), uploadDir);
    const target = resolve(root, relative);
    if (target !== root && !target.startsWith(root + sep)) {
      throw new BadRequestException('مسار الملف غير صالح');
    }
    return target;
  }

  async upload(file: Express.Multer.File, folder: string): Promise<StoredFile> {
    const uploadDir = this.config.get<string>('storage.uploadDir') ?? 'uploads';
    const baseUrl = this.config.get<string>('storage.publicBaseUrl') ?? '';

    const ext = extname(file.originalname).toLowerCase();
    const name = `${randomUUID()}${ALLOWED_EXTENSIONS.has(ext) ? ext : ''}`;
    const relative = join(folder, name);

    const target = this.resolveWithinUploadDir(uploadDir, relative);
    await mkdir(join(process.cwd(), uploadDir, folder), { recursive: true });
    await writeFile(target, file.buffer);

    return { url: `${baseUrl}/uploads/${relative}`, publicId: relative };
  }

  async delete(publicId: string): Promise<void> {
    const uploadDir = this.config.get<string>('storage.uploadDir') ?? 'uploads';
    const target = this.resolveWithinUploadDir(uploadDir, publicId);
    await unlink(target).catch(() => undefined);
  }
}
