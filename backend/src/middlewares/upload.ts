import multer from 'multer';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';
import { UPLOAD_KINDS } from '../config/constants.js';

export type UploadKind = keyof typeof UPLOAD_KINDS;

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.MAX_UPLOAD_MB * 1024 * 1024,
    files: 12,
    fields: 40,
  },
  fileFilter: (_req, file, callback) => {
    if (file.mimetype === 'image/svg+xml') {
      callback(AppError.badRequest('Les fichiers SVG sont refuses pour des raisons de securite.'));
      return;
    }
    callback(null, true);
  },
});

/** Detecte le type reel du fichier (on ne fait pas confiance au mimetype client). */
export function detectMime(buffer: Buffer): string | null {
  if (buffer.length < 12) return 'application/octet-stream';

  const hex = (start: number, end: number) => buffer.subarray(start, end).toString('hex');

  if (hex(0, 3) === 'ffd8ff') return 'image/jpeg';
  if (hex(0, 8) === '89504e470d0a1a0a') return 'image/png';
  if (buffer.subarray(0, 4).toString('ascii') === 'GIF8') return 'image/gif';
  if (
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  if (buffer.subarray(4, 8).toString('ascii') === 'ftyp') {
    const brand = buffer.subarray(8, 12).toString('ascii');
    if (brand.startsWith('avi') || brand.startsWith('avis')) return 'image/avif';
    return 'audio/mp4';
  }
  if (buffer.subarray(0, 4).toString('ascii') === '%PDF') return 'application/pdf';
  if (buffer.subarray(0, 4).toString('ascii') === 'ID3' || hex(0, 2) === 'fffb') {
    return 'audio/mpeg';
  }
  if (buffer.subarray(0, 4).toString('ascii') === 'OggS') return 'audio/ogg';
  if (
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WAVE'
  ) {
    return 'audio/wav';
  }
  if (buffer.subarray(0, 4).toString('hex') === '1a45dfa3') return 'audio/webm';
  return null;
}

export interface ValidatedFile {
  buffer: Buffer;
  mime: string;
  extension: string;
  originalName: string;
  size: number;
}

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/gif': 'gif',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/webm': 'webm',
  'application/pdf': 'pdf',
};

/** Valide un fichier recu contre les types autorises pour l'usage demande. */
export function validateUpload(file: Express.Multer.File | undefined, kind: UploadKind): ValidatedFile {
  if (!file) throw AppError.badRequest('Aucun fichier recu.');
  const detected = detectMime(file.buffer);
  if (!detected || !UPLOAD_KINDS[kind].includes(detected as never)) {
    throw AppError.badRequest(
      `Format non autorise. Formats acceptes : ${UPLOAD_KINDS[kind].join(', ')}.`,
    );
  }
  return {
    buffer: file.buffer,
    mime: detected,
    extension: EXTENSIONS[detected] ?? 'bin',
    originalName: file.originalname.slice(0, 180),
    size: file.size,
  };
}

export function safeFileSegment(value: string, fallback = 'fichier'): string {
  const cleaned = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return cleaned || fallback;
}
