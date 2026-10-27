import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env, publicApiUrl } from '../config/env.js';
import { signFileUrl } from '../auth/tokens.js';

export interface SignedUrlOptions {
  ttlSeconds?: number;
  downloadName?: string;
}

export interface FileStorage {
  readonly driver: 'local' | 'supabase';
  /** `relativePath` est toujours controle (pas de `..`, pas de chemin absolu). */
  save(relativePath: string, data: Buffer, contentType: string): Promise<void>;
  read(relativePath: string): Promise<Buffer>;
  remove(relativePath: string): Promise<void>;
  signedUrl(relativePath: string, options?: SignedUrlOptions): Promise<string>;
  publicUrl(relativePath: string): Promise<string>;
}

export function assertSafePath(relativePath: string): string {
  const normalized = path.posix.normalize(relativePath.replace(/\\/g, '/'));
  if (
    normalized.startsWith('..') ||
    normalized.includes('../') ||
    path.isAbsolute(normalized) ||
    normalized.includes('\0')
  ) {
    throw new Error('Chemin de stockage invalide.');
  }
  return normalized.replace(/^\/+/, '');
}

class LocalFileStorage implements FileStorage {
  readonly driver = 'local' as const;

  private resolve(relativePath: string): string {
    return path.join(env.STORAGE_LOCAL_DIR, assertSafePath(relativePath));
  }

  async save(relativePath: string, data: Buffer): Promise<void> {
    const target = this.resolve(relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, data);
  }

  async read(relativePath: string): Promise<Buffer> {
    return readFile(this.resolve(relativePath));
  }

  async remove(relativePath: string): Promise<void> {
    await rm(this.resolve(relativePath), { force: true });
  }

  async signedUrl(relativePath: string, options: SignedUrlOptions = {}): Promise<string> {
    return signFileUrl(assertSafePath(relativePath), options.ttlSeconds ?? 900);
  }

  /** En local, les visuels publics utilisent une URL signee de longue duree. */
  async publicUrl(relativePath: string): Promise<string> {
    return signFileUrl(assertSafePath(relativePath), 60 * 60 * 24 * 30);
  }

  /** Utilise par la route de telechargement locale. */
  absolutePath(relativePath: string): string {
    return this.resolve(relativePath);
  }
}

class SupabaseFileStorage implements FileStorage {
  readonly driver = 'supabase' as const;
  private readonly client: SupabaseClient;

  constructor() {
    this.client = createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  private isPublic(relativePath: string): boolean {
    return relativePath.startsWith('public/');
  }

  private bucketFor(relativePath: string): string {
    return this.isPublic(relativePath)
      ? env.SUPABASE_PUBLIC_BUCKET
      : env.SUPABASE_STORAGE_BUCKET;
  }

  /** Retire le prefixe `public/` : le bucket public le remplace. */
  private objectKey(relativePath: string): string {
    const safe = assertSafePath(relativePath);
    return this.isPublic(safe) ? safe.slice('public/'.length) : safe;
  }

  async save(relativePath: string, data: Buffer, contentType: string): Promise<void> {
    const bucket = this.bucketFor(relativePath);
    const { error } = await this.client.storage
      .from(bucket)
      .upload(this.objectKey(relativePath), data, { contentType, upsert: true });
    if (error) throw new Error(`Echec du televersement Supabase: ${error.message}`);
  }

  async read(relativePath: string): Promise<Buffer> {
    const { data, error } = await this.client.storage
      .from(this.bucketFor(relativePath))
      .download(this.objectKey(relativePath));
    if (error || !data) {
      throw new Error(`Telechargement Supabase impossible: ${error?.message ?? 'inconnu'}`);
    }
    return Buffer.from(await data.arrayBuffer());
  }

  async remove(relativePath: string): Promise<void> {
    const { error } = await this.client.storage
      .from(this.bucketFor(relativePath))
      .remove([this.objectKey(relativePath)]);
    if (error) throw new Error(`Echec de la suppression Supabase: ${error.message}`);
  }

  async signedUrl(relativePath: string, options: SignedUrlOptions = {}): Promise<string> {
    if (this.isPublic(relativePath)) return this.publicUrl(relativePath);
    const { data, error } = await this.client.storage
      .from(this.bucketFor(relativePath))
      .createSignedUrl(this.objectKey(relativePath), options.ttlSeconds ?? 900, {
        download: options.downloadName,
      });
    if (error || !data) {
      throw new Error(`URL signee impossible: ${error?.message ?? 'inconnue'}`);
    }
    return data.signedUrl;
  }

  async publicUrl(relativePath: string): Promise<string> {
    const { data } = this.client.storage
      .from(this.bucketFor(relativePath))
      .getPublicUrl(this.objectKey(relativePath));
    return data.publicUrl;
  }
}

let storage: FileStorage | null = null;

export function getStorage(): FileStorage {
  if (storage) return storage;
  storage = env.STORAGE_DRIVER === 'supabase'
    ? new SupabaseFileStorage()
    : new LocalFileStorage();
  return storage;
}

export function localStorageOrNull(): LocalFileStorage | null {
  const driver = getStorage();
  return driver instanceof LocalFileStorage ? driver : null;
}

export const fileApiBase = publicApiUrl;
