import { Router } from 'express';
import { z } from 'zod';
import archiver from 'archiver';
import { asyncHandler } from '../../middlewares/error.js';
import { bodyOf, paramsOf, queryOf, validate } from '../../middlewares/validate.js';
import { authContext, requireAuth, requireMedia } from '../../middlewares/auth.js';
import { upload, validateUpload, type ValidatedFile } from '../../middlewares/upload.js';
import { uploadLimiter } from '../../middlewares/rateLimit.js';
import { getDatabase } from '../../db/client.js';
import { AppError } from '../../utils/errors.js';
import { getStorage } from '../../storage/index.js';
import { storeUpload } from '../../services/files.js';
import {
  albumInputSchema,
  albumPhotoPaths,
  albumQuerySchema,
  addPhoto,
  createAlbum,
  deleteAlbum,
  deletePhoto,
  getAlbum,
  grantAlbumAccess,
  listAlbumGrants,
  listAlbums,
  revokeAlbumAccess,
  updateAlbum,
  updatePhoto,
  type AlbumInput,
} from './albums-service.js';
import { recordAudit } from '../../middlewares/audit.js';
import { logger } from '../../utils/logger.js';

export const mediaRouter = Router();

mediaRouter.use(requireAuth, requireMedia);

const uuidParams = z.object({ id: z.string().uuid('Identifiant invalide.') });
const photoParams = z.object({ id: z.string().uuid('Identifiant invalide.') });

mediaRouter.get(
  '/albums',
  validate({ query: albumQuerySchema }),
  asyncHandler(async (req, res) => {
    const query = queryOf<z.infer<typeof albumQuerySchema>>(req);
    res.json(await listAlbums(authContext(req).profile, query, { manage: true }));
  }),
);

mediaRouter.get(
  '/albums/:id',
  validate({ params: uuidParams }),
  asyncHandler(async (req, res) => {
    const { id } = paramsOf<{ id: string }>(req);
    const album = await getAlbum(authContext(req).profile, id, { byId: true, manage: true });
    res.json(album);
  }),
);

mediaRouter.post(
  '/albums',
  validate({ body: albumInputSchema }),
  asyncHandler(async (req, res) => {
    const input = bodyOf<AlbumInput>(req);
    const album = await createAlbum(input, authContext(req).profile);
    res.status(201).json(album);
  }),
);

mediaRouter.patch(
  '/albums/:id',
  validate({
    params: uuidParams,
    body: albumInputSchema.partial().extend({
      coverPhotoId: z.string().uuid().nullish(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { id } = paramsOf<{ id: string }>(req);
    const input = bodyOf<Partial<AlbumInput> & { coverPhotoId?: string | null }>(req);
    res.json(await updateAlbum(id, input, authContext(req).profile));
  }),
);

mediaRouter.delete(
  '/albums/:id',
  validate({ params: uuidParams }),
  asyncHandler(async (req, res) => {
    const { profile } = authContext(req);
    if (profile.role !== 'admin') {
      throw AppError.forbidden("Seul un administrateur peut supprimer definitivement un album.");
    }
    const { id } = paramsOf<{ id: string }>(req);
    await deleteAlbum(id, profile);
    res.json({ ok: true });
  }),
);

mediaRouter.post(
  '/albums/:id/photos',
  uploadLimiter,
  upload.array('photos', 12),
  validate({ params: uuidParams }),
  asyncHandler(async (req, res) => {
    const { profile } = authContext(req);
    const { id } = paramsOf<{ id: string }>(req);
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (files.length === 0) throw AppError.badRequest('Aucun fichier recu.');

    // Verifie l'album et les droits avant tout stockage.
    await getAlbum(profile, id, { byId: true, manage: true });

    const validated: ValidatedFile[] = files.map((file) => validateUpload(file, 'image'));
    const captions = req.body?.captions ? String(req.body.captions).split('||') : [];

    const created = [];
    for (const [index, file] of validated.entries()) {
      const stored = await storeUpload(`albums/${id}`, file);
      created.push(
        await addPhoto(
          id,
          {
            storagePath: stored.path,
            fileName: file.originalName,
            mimeType: file.mime,
            sizeBytes: file.size,
            caption: captions[index]?.trim() || null,
          },
          profile,
        ),
      );
    }

    await recordAudit(getDatabase(), {
      actorId: profile.id,
      actorEmail: profile.email,
      action: 'album.photos_upload',
      entityType: 'album',
      entityId: id,
      metadata: { count: created.length },
    });

    res.status(201).json({ photos: created });
  }),
);

mediaRouter.patch(
  '/photos/:id',
  validate({
    params: photoParams,
    body: z.object({
      caption: z.string().trim().max(500).nullish(),
      sortOrder: z.coerce.number().int().min(0).max(9999).optional(),
      takenAt: z.string().trim().nullish(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { id } = paramsOf<{ id: string }>(req);
    const input = bodyOf<{ caption?: string | null; sortOrder?: number; takenAt?: string | null }>(
      req,
    );
    res.json(await updatePhoto(id, input, authContext(req).profile));
  }),
);

mediaRouter.delete(
  '/photos/:id',
  validate({ params: photoParams }),
  asyncHandler(async (req, res) => {
    const { id } = paramsOf<{ id: string }>(req);
    await deletePhoto(id, authContext(req).profile);
    res.json({ ok: true });
  }),
);

mediaRouter.get(
  '/albums/:id/access',
  validate({ params: uuidParams }),
  asyncHandler(async (req, res) => {
    const { id } = paramsOf<{ id: string }>(req);
    res.json({ grants: await listAlbumGrants(id) });
  }),
);

mediaRouter.post(
  '/albums/:id/access',
  validate({ params: uuidParams, body: z.object({ profileId: z.string().uuid() }) }),
  asyncHandler(async (req, res) => {
    const { id } = paramsOf<{ id: string }>(req);
    const { profileId } = bodyOf<{ profileId: string }>(req);
    await grantAlbumAccess(id, profileId, authContext(req).profile);
    res.status(201).json({ ok: true });
  }),
);

mediaRouter.delete(
  '/albums/:id/access/:profileId',
  validate({
    params: z.object({ id: z.string().uuid(), profileId: z.string().uuid() }),
  }),
  asyncHandler(async (req, res) => {
    const { id, profileId } = paramsOf<{ id: string; profileId: string }>(req);
    await revokeAlbumAccess(id, profileId, authContext(req).profile);
    res.json({ ok: true });
  }),
);

mediaRouter.post(
  '/albums/:id/publish',
  validate({ params: uuidParams }),
  asyncHandler(async (req, res) => {
    const { id } = paramsOf<{ id: string }>(req);
    res.json(await updateAlbum(id, { status: 'published' }, authContext(req).profile));
  }),
);

mediaRouter.post(
  '/albums/:id/archive',
  validate({ params: uuidParams }),
  asyncHandler(async (req, res) => {
    const { id } = paramsOf<{ id: string }>(req);
    res.json(await updateAlbum(id, { status: 'archived' }, authContext(req).profile));
  }),
);

mediaRouter.get(
  '/albums/:id/download',
  validate({ params: uuidParams }),
  asyncHandler(async (req, res) => {
    const { profile } = authContext(req);
    const { id } = paramsOf<{ id: string }>(req);
    const album = await getAlbum(profile, id, { byId: true, manage: true });
    if (album.access === 'restricted' && profile.role !== 'admin') {
      throw AppError.forbidden('Le telechargement des albums restreints est reserve aux administrateurs.');
    }
    const paths = await albumPhotoPaths(id);
    if (paths.length === 0) throw AppError.badRequest('Cet album ne contient aucune photo.');

    const storage = getStorage();
    const safeTitle = album.title
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'album';

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}.zip"`);

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', (error) => {
      logger.error('[zip] erreur', error);
      res.destroy(error);
    });
    archive.pipe(res);

    await recordAudit(getDatabase(), {
      actorId: profile.id,
      actorEmail: profile.email,
      action: 'album.download',
      entityType: 'album',
      entityId: id,
      metadata: { photos: paths.length, format: 'zip' },
    });

    for (const [index, path] of paths.entries()) {
      try {
        const data = await storage.read(path.storage_path);
        const name = path.file_name.replace(/[^\w.\-]+/g, '-');
        archive.append(data, { name: `${String(index + 1).padStart(3, '0')}-${name}` });
      } catch (error) {
        logger.error(`[zip] fichier ignore : ${path.storage_path}`, error);
      }
    }

    await archive.finalize();
  }),
);
