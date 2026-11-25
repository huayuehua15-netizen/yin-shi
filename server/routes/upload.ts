import type { RequestHandler } from 'express';

/** Minimal structural type so route modules don't depend on multer's typings. */
export interface MultipartUpload {
  single(field: string): RequestHandler;
}
