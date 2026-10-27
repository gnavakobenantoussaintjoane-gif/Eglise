import { randomUUID } from 'node:crypto';
import { getStorage } from '../storage/index.js';
import type { ValidatedFile } from '../middlewares/upload.js';
import { safeFileSegment } from '../middlewares/upload.js';

export interface StoredUpload {
  path: string;
  url: string;
  mime: string;
  size: number;
  originalName: string;
}

export async function storeUpload(
  prefix: string,
  file: ValidatedFile,
  options: { publicFile?: boolean } = {},
): Promise<StoredUpload> {
  const storage = getStorage();
  const base = options.publicFile ? `public/${prefix}` : prefix;
  const name = `${Date.now()}-${randomUUID().slice(0, 8)}-${safeFileSegment(
    file.originalName.replace(/\.[^.]+$/, ''),
  )}.${file.extension}`;
  const storagePath = `${base}/${name}`;
  await storage.save(storagePath, file.buffer, file.mime);
  return {
    path: storagePath,
    url: await storage.signedUrl(storagePath, { ttlSeconds: 900 }),
    mime: file.mime,
    size: file.size,
    originalName: file.originalName,
  };
}

export async function removeStoredFile(storagePath: string | null | undefined): Promise<void> {
  if (!storagePath) return;
  try {
    await getStorage().remove(storagePath);
  } catch (error) {
    console.error('[storage] suppression impossible', storagePath, error);
  }
}

export async function signedFileUrl(
  storagePath: string | null | undefined,
  ttlSeconds = 900,
): Promise<string | null> {
  if (!storagePath) return null;
  try {
    return await getStorage().signedUrl(storagePath, { ttlSeconds });
  } catch (error) {
    console.error('[storage] URL signee impossible', storagePath, error);
    return null;
  }
}

/** Resout en lot les URLs de plusieurs chemins (photos de galerie). */
export async function signedFileUrls(
  paths: (string | null | undefined)[],
  ttlSeconds = 900,
): Promise<Map<string, string>> {
  const entries = await Promise.all(
    paths
      .filter((value): value is string => Boolean(value))
      .map(async (path) => [path, await signedFileUrl(path, ttlSeconds)] as const),
  );
  return new Map(
    entries.filter((entry): entry is readonly [string, string] => Boolean(entry[1])),
  );
}
