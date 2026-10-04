import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { ErrorRequestHandler } from 'express';

export const uploadRoot = path.resolve(process.env.UPLOAD_DIR || 'uploads');
const allowedImages: Record<string, string[]> = {
  'image/jpeg': ['.jpg', '.jpeg'], 'image/png': ['.png'], 'image/webp': ['.webp'], 'image/gif': ['.gif'],
};
export function isAllowedImage(mimetype: string, filename: string): boolean {
  return allowedImages[mimetype]?.includes(path.extname(filename).toLowerCase()) ?? false;
}
class ImageUploadError extends Error {}

export function createImageUpload(scope: 'products' | 'posts' | 'petani', root = uploadRoot) {
  const configuredSize = Number(process.env.MAX_FILE_SIZE);
  const fileSize = Number.isSafeInteger(configuredSize) && configuredSize > 0 && configuredSize <= 10 * 1024 * 1024
    ? configuredSize : 5 * 1024 * 1024;
  return multer({
    storage: multer.diskStorage({
      destination: (_req, _file, callback) => {
        const destination = path.join(root, scope);
        try { fs.mkdirSync(destination, { recursive: true }); callback(null, destination); }
        catch (error) { callback(error as Error, destination); }
      },
      filename: (_req, file, callback) => callback(null, `${scope}-${randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
    }),
    limits: { fileSize, files: scope === 'posts' ? 2 : 1, fields: 30, fieldSize: 1024 * 1024 },
    fileFilter: (_req, file, callback) => {
      if (isAllowedImage(file.mimetype, file.originalname)) callback(null, true);
      else callback(new ImageUploadError('Gunakan gambar JPEG, PNG, WebP, atau GIF dengan ekstensi yang sesuai.'));
    },
  });
}

export const uploadErrorHandler: ErrorRequestHandler = (error: unknown, _req, res, next) => {
  if (error instanceof multer.MulterError) {
    res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: error.code === 'LIMIT_FILE_SIZE'
      ? 'Ukuran gambar melampaui batas upload.' : 'File atau isian upload tidak sesuai. Periksa kembali formulir.' });
  } else if (error instanceof ImageUploadError) res.status(400).json({ error: error.message });
  else next(error);
};
