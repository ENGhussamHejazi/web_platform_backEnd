/** Result of storing a single file. */
export interface StoredFile {
  /** Absolute, publicly reachable URL of the stored image. */
  url: string;
  /**
   * Driver-specific identifier used to delete the file later.
   * Cloudinary: the asset `public_id`. Local: the path relative to UPLOAD_DIR.
   */
  publicId: string;
}

/**
 * A place images can be written to. Implementations are selected at runtime by
 * the STORAGE_DRIVER env var — see StorageModule.
 */
export interface StorageDriver {
  upload(file: Express.Multer.File, folder: string): Promise<StoredFile>;
  delete(publicId: string): Promise<void>;
}

export const STORAGE_DRIVER = Symbol('STORAGE_DRIVER');
