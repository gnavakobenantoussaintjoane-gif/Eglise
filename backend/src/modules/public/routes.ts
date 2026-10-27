import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middlewares/error.js';
import { bodyOf, paramsOf, queryOf, validate } from '../../middlewares/validate.js';
import { publicWriteLimiter } from '../../middlewares/rateLimit.js';
import { getSettings } from '../settings/service.js';
import { getDepartmentBySlug, listDepartments } from '../departments/service.js';
import { getAlbum, listAlbums, albumQuerySchema } from '../gallery/albums-service.js';
import {
  createPrayerRequest,
  listAnnouncements,
  listPublicTestimonies,
  prayerInputSchema,
} from '../content/community.js';
import {
  eventQuerySchema,
  getEvent,
  listEvents,
  registerForEvent,
  registrationInputSchema,
} from '../content/events.js';
import { getSermon, listSermons, sermonQuerySchema } from '../content/sermons.js';
import { getDatabase } from '../../db/client.js';
import { recordAudit, clientIp } from '../../middlewares/audit.js';
import { AppError } from '../../utils/errors.js';

export const publicRouter = Router();

const slugParams = z.object({ slug: z.string().trim().min(1).max(160) });

publicRouter.get(
  '/settings',
  asyncHandler(async (_req, res) => {
    res.json(await getSettings());
  }),
);

publicRouter.get(
  '/departments',
  asyncHandler(async (_req, res) => {
    res.json({ departments: await listDepartments({ publicOnly: true }) });
  }),
);

publicRouter.get(
  '/departments/:slug',
  validate({ params: slugParams }),
  asyncHandler(async (req, res) => {
    const { slug } = paramsOf<{ slug: string }>(req);
    const department = await getDepartmentBySlug(slug);
    if (!department) throw AppError.notFound('Departement introuvable.');
    res.json(department);
  }),
);

publicRouter.get(
  '/sermons',
  validate({ query: sermonQuerySchema }),
  asyncHandler(async (req, res) => {
    const query = queryOf<z.infer<typeof sermonQuerySchema>>(req);
    res.json(await listSermons(query, false));
  }),
);

publicRouter.get(
  '/sermons/:slug',
  validate({ params: slugParams }),
  asyncHandler(async (req, res) => {
    const { slug } = paramsOf<{ slug: string }>(req);
    res.json(await getSermon(slug, false));
  }),
);

publicRouter.get(
  '/events',
  validate({ query: eventQuerySchema }),
  asyncHandler(async (req, res) => {
    const query = queryOf<z.infer<typeof eventQuerySchema>>(req);
    res.json(await listEvents(query));
  }),
);

publicRouter.get(
  '/events/:slug',
  validate({ params: slugParams }),
  asyncHandler(async (req, res) => {
    const { slug } = paramsOf<{ slug: string }>(req);
    res.json(await getEvent(slug, false));
  }),
);

publicRouter.post(
  '/events/:slug/register',
  publicWriteLimiter,
  validate({ params: slugParams, body: registrationInputSchema }),
  asyncHandler(async (req, res) => {
    const { slug } = paramsOf<{ slug: string }>(req);
    const input = bodyOf<z.infer<typeof registrationInputSchema>>(req);
    const result = await registerForEvent(slug, input, req.auth ? { id: req.auth.profile.id } : null);
    const db = getDatabase();
    await recordAudit(db, {
      actorId: req.auth?.profile.id ?? null,
      actorEmail: input.email,
      action: 'event.register',
      entityType: 'event_registration',
      entityId: result.id,
      ip: clientIp(req.ip),
    });
    res.status(201).json(result);
  }),
);

publicRouter.get(
  '/announcements',
  asyncHandler(async (_req, res) => {
    res.json({ announcements: await listAnnouncements({ audience: 'public', limit: 6 }) });
  }),
);

publicRouter.get(
  '/albums',
  validate({ query: albumQuerySchema }),
  asyncHandler(async (req, res) => {
    const query = queryOf<z.infer<typeof albumQuerySchema>>(req);
    res.json(await listAlbums(req.auth?.profile ?? null, query));
  }),
);

publicRouter.get(
  '/albums/:slug',
  validate({ params: slugParams }),
  asyncHandler(async (req, res) => {
    const { slug } = paramsOf<{ slug: string }>(req);
    res.json(await getAlbum(req.auth?.profile ?? null, slug));
  }),
);

publicRouter.get(
  '/testimonies',
  asyncHandler(async (_req, res) => {
    res.json({ testimonies: await listPublicTestimonies() });
  }),
);

publicRouter.post(
  '/prayer-requests',
  publicWriteLimiter,
  validate({ body: prayerInputSchema }),
  asyncHandler(async (req, res) => {
    const input = bodyOf<z.infer<typeof prayerInputSchema>>(req);
    const result = await createPrayerRequest(input, req.auth?.profile.id ?? null);
    const db = getDatabase();
    await recordAudit(db, {
      actorId: req.auth?.profile.id ?? null,
      action: 'prayer.create',
      entityType: 'prayer_request',
      entityId: result.id,
      ip: clientIp(req.ip),
    });
    res.status(201).json({
      id: result.id,
      message: 'Votre demande de priere a bien ete transmise. Elle reste confidentielle.',
    });
  }),
);

const takedownInputSchema = z.object({
  photoId: z.string().uuid().optional(),
  albumId: z.string().uuid().optional(),
  requesterName: z.string().trim().min(2, 'Nom requis.').max(160),
  requesterEmail: z.string().trim().email('E-mail invalide.').max(180),
  reason: z.string().trim().min(10, 'Merci de preciser votre demande.').max(2000),
});

publicRouter.post(
  '/gallery/takedown-requests',
  publicWriteLimiter,
  validate({ body: takedownInputSchema }),
  asyncHandler(async (req, res) => {
    const input = bodyOf<z.infer<typeof takedownInputSchema>>(req);
    const db = getDatabase();
    const { rows } = await db.query<{ id: string }>(
      `insert into public.photo_takedown_requests
         (photo_id, album_id, requester_name, requester_email, reason)
       values ($1,$2,$3,$4,$5) returning id`,
      [
        input.photoId ?? null,
        input.albumId ?? null,
        input.requesterName,
        input.requesterEmail.toLowerCase(),
        input.reason,
      ],
    );
    await recordAudit(db, {
      action: 'gallery.takedown_request',
      entityType: 'photo_takedown_request',
      entityId: rows[0].id,
      metadata: { albumId: input.albumId ?? null, photoId: input.photoId ?? null },
      ip: clientIp(req.ip),
    });
    res.status(201).json({
      id: rows[0].id,
      message:
        'Votre demande de retrait a ete enregistree. Un administrateur la traitera rapidement.',
    });
  }),
);
