import { Router } from 'express';
import path from 'node:path';
import { verifyFileSignature } from '../../auth/tokens.js';
import { localStorageOrNull } from '../../storage/index.js';
import { AppError } from '../../utils/errors.js';
import { asyncHandler } from '../../middlewares/error.js';

export const filesRouter = Router();

const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
  gif: 'image/gif',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
  webm: 'audio/webm',
  pdf: 'application/pdf',
};

/**
 * Sert un fichier prive via une URL signee de courte duree.
 * Indisponible avec le stockage Supabase (URLs signees generees en amont).
 */
filesRouter.get(
  '/:token',
  asyncHandler(async (req, res) => {
    const storage = localStorageOrNull();
    if (!storage) throw AppError.notFound('Fichier introuvable.');

    const [token, signature] = String(req.params.token).split('.');
    if (!token || !signature) throw AppError.forbidden('Lien de fichier invalide.');

    const check = verifyFileSignature(token, signature);
    if (!check.valid) throw AppError.forbidden('Signature de fichier invalide.');
    if (check.expired) throw AppError.forbidden('Lien expire, rechargez la page.');
    if (!check.storagePath) throw AppError.forbidden('Chemin de fichier invalide.');

    let data: Buffer;
    try {
      data = await storage.read(check.storagePath);
    } catch {
      throw AppError.notFound('Fichier introuvable.');
    }

    const extension = path.extname(check.storagePath).replace('.', '').toLowerCase();
    const mime = MIME_BY_EXT[extension] ?? 'application/octet-stream';
    const download = typeof req.query.download === 'string';

    res.setHeader('Content-Type', mime);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Cache-Control',
      check.storagePath.startsWith('public/') ? 'public, max-age=86400' : 'private, max-age=300',
    );
    if (download) {
      const name = path.basename(check.storagePath).replace(/[^\w.-]+/g, '-');
      res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    }
    res.send(data);
  }),
);
