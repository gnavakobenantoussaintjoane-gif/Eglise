import { z } from 'zod';
import { getDatabase } from '../../db/client.js';
import { AppError } from '../../utils/errors.js';
import { uniqueSlug } from '../../utils/slug.js';
import { buildPagination, resolvePagination } from '../../utils/pagination.js';
import { signedFileUrl, removeStoredFile } from '../../services/files.js';
import { recordAudit } from '../../middlewares/audit.js';
import { notifyProfiles } from '../../services/notifications.js';

export const eventInputSchema = z.object({
  title: z.string().trim().min(2, 'Titre requis.').max(160),
  description: z.string().trim().max(6000).nullish(),
  category: z.string().trim().max(80).nullish(),
  location: z.string().trim().max(200).nullish(),
  startsAt: z.string().trim().min(10, 'Date de debut requise.'),
  endsAt: z.string().trim().nullish(),
  capacity: z.coerce.number().int().min(1).max(100000).nullish(),
  registrationOpen: z.boolean().optional(),
  isPublished: z.boolean().optional(),
});

export type EventInput = z.infer<typeof eventInputSchema>;

export const eventQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(60).default(12),
  upcoming: z.coerce.boolean().optional(),
  past: z.coerce.boolean().optional(),
});

export const registrationInputSchema = z.object({
  fullName: z.string().trim().min(2, 'Nom requis.').max(160),
  email: z.string().trim().email('E-mail invalide.').max(180),
  phone: z.string().trim().max(40).optional(),
  seats: z.coerce.number().int().min(1).max(10).default(1),
  note: z.string().trim().max(600).optional(),
});

interface EventRow {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  category: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string | null;
  capacity: number | null;
  registration_open: boolean;
  cover_path: string | null;
  is_published: boolean;
  created_at: string;
  registered?: string | number;
}

async function mapEvent(row: EventRow) {
  const registered = Number(row.registered ?? 0);
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    description: row.description,
    category: row.category,
    location: row.location,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    capacity: row.capacity,
    registrationOpen: row.registration_open,
    coverUrl: await signedFileUrl(row.cover_path, 3600),
    isPublished: row.is_published,
    registeredCount: registered,
    remainingSeats: row.capacity ? Math.max(0, row.capacity - registered) : null,
    createdAt: row.created_at,
  };
}

const EVENT_SELECT = `
  select e.*, (
    select coalesce(sum(er.seats), 0) from public.event_registrations er
    where er.event_id = e.id and er.status = 'confirmed'
  ) as registered
  from public.events e
`;

export async function listEvents(
  query: z.infer<typeof eventQuerySchema>,
  options: { includeDrafts?: boolean } = {},
) {
  const db = getDatabase();
  const where: string[] = [];
  const params: unknown[] = [];
  if (!options.includeDrafts) where.push('e.is_published = true');
  if (query.upcoming) where.push('e.starts_at >= now()');
  if (query.past) where.push('e.starts_at < now()');
  const whereSql = where.length ? `where ${where.join(' and ')}` : '';
  const { limit, offset } = resolvePagination(query.page, query.perPage);
  const total = await db.query<{ total: string }>(
    `select count(*)::text as total from public.events e ${whereSql}`,
    params,
  );
  params.push(limit, offset);
  const { rows } = await db.query<EventRow>(
    `${EVENT_SELECT} ${whereSql}
     order by ${query.past ? 'e.starts_at desc' : 'e.starts_at asc'}
     limit $${params.length - 1} offset $${params.length}`,
    params,
  );
  return {
    events: await Promise.all(rows.map(mapEvent)),
    pagination: buildPagination(query.page, query.perPage, Number(total.rows[0]?.total ?? 0)),
  };
}

export async function getEvent(slug: string, includeDrafts = false) {
  const db = getDatabase();
  const { rows } = await db.query<EventRow>(`${EVENT_SELECT} where e.slug = $1`, [slug]);
  const event = rows[0];
  if (!event || (!includeDrafts && !event.is_published)) {
    throw AppError.notFound('Evenement introuvable.');
  }
  return mapEvent(event);
}

export async function createEvent(input: EventInput, actor: { id: string; email: string }) {
  const db = getDatabase();
  const slug = await uniqueSlug(db, 'events', input.title);
  const { rows } = await db.query<EventRow>(
    `insert into public.events
       (title, slug, description, category, location, starts_at, ends_at, capacity,
        registration_open, is_published, created_by)
     values ($1,$2,$3,$4,$5,$6::timestamptz,$7::timestamptz,$8,$9,$10,$11)
     returning *`,
    [
      input.title,
      slug,
      input.description ?? null,
      input.category ?? null,
      input.location ?? null,
      input.startsAt,
      input.endsAt ?? null,
      input.capacity ?? null,
      input.registrationOpen ?? false,
      input.isPublished ?? false,
      actor.id,
    ],
  );
  await recordAudit(db, {
    actorId: actor.id,
    actorEmail: actor.email,
    action: 'event.create',
    entityType: 'event',
    entityId: rows[0].id,
  });
  return mapEvent(rows[0]);
}

export async function updateEvent(
  id: string,
  input: Partial<EventInput>,
  actor: { id: string; email: string },
) {
  const db = getDatabase();
  const { rows } = await db.query<EventRow>(
    `update public.events set
       title = coalesce($2, title),
       description = case when $3::boolean then $4 else description end,
       category = case when $5::boolean then $6 else category end,
       location = case when $7::boolean then $8 else location end,
       starts_at = coalesce($9::timestamptz, starts_at),
       ends_at = case when $10::boolean then $11::timestamptz else ends_at end,
       capacity = case when $12::boolean then $13 else capacity end,
       registration_open = coalesce($14, registration_open),
       is_published = coalesce($15, is_published)
     where id = $1 returning *`,
    [
      id,
      input.title ?? null,
      input.description !== undefined,
      input.description ?? null,
      input.category !== undefined,
      input.category ?? null,
      input.location !== undefined,
      input.location ?? null,
      input.startsAt ?? null,
      input.endsAt !== undefined,
      input.endsAt ?? null,
      input.capacity !== undefined,
      input.capacity ?? null,
      input.registrationOpen ?? null,
      input.isPublished ?? null,
    ],
  );
  if (!rows[0]) throw AppError.notFound('Evenement introuvable.');
  await recordAudit(db, {
    actorId: actor.id,
    actorEmail: actor.email,
    action: 'event.update',
    entityType: 'event',
    entityId: id,
  });
  return mapEvent(rows[0]);
}

export async function setEventCover(
  id: string,
  storagePath: string,
  actor: { id: string; email: string },
) {
  const db = getDatabase();
  const previous = await db.query<{ cover_path: string | null }>(
    'select cover_path from public.events where id = $1',
    [id],
  );
  if (!previous.rows[0]) throw AppError.notFound('Evenement introuvable.');
  const { rows } = await db.query<EventRow>(
    'update public.events set cover_path = $2 where id = $1 returning *',
    [id, storagePath],
  );
  await removeStoredFile(previous.rows[0].cover_path);
  await recordAudit(db, {
    actorId: actor.id,
    actorEmail: actor.email,
    action: 'event.cover_upload',
    entityType: 'event',
    entityId: id,
  });
  return mapEvent(rows[0]);
}

export async function deleteEvent(id: string, actor: { id: string; email: string }) {
  const db = getDatabase();
  const { rows } = await db.query<EventRow>('select * from public.events where id = $1', [id]);
  if (!rows[0]) throw AppError.notFound('Evenement introuvable.');
  await db.query('delete from public.events where id = $1', [id]);
  await removeStoredFile(rows[0].cover_path);
  await recordAudit(db, {
    actorId: actor.id,
    actorEmail: actor.email,
    action: 'event.delete',
    entityType: 'event',
    entityId: id,
  });
}

export async function registerForEvent(
  slug: string,
  input: z.infer<typeof registrationInputSchema>,
  viewer: { id: string } | null,
) {
  const db = getDatabase();
  const { rows } = await db.query<EventRow>(`${EVENT_SELECT} where e.slug = $1`, [slug]);
  const event = rows[0];
  if (!event) throw AppError.notFound('Evenement introuvable.');
  if (!event.is_published) throw AppError.notFound('Evenement introuvable.');
  if (!event.registration_open) {
    throw AppError.badRequest("Les inscriptions pour cet evenement sont fermees.");
  }

  const registered = Number(event.registered ?? 0);
  if (event.capacity && registered + input.seats > event.capacity) {
    const remaining = Math.max(0, event.capacity - registered);
    throw AppError.conflict(
      remaining === 0
        ? 'Cet evenement est complet.'
        : `Il ne reste que ${remaining} place(s) disponible(s).`,
    );
  }

  const duplicate = await db.query<{ id: string }>(
    `select id from public.event_registrations
     where event_id = $1 and lower(email) = lower($2) and status = 'confirmed' limit 1`,
    [event.id, input.email],
  );
  if (duplicate.rows[0]) {
    throw AppError.conflict('Une inscription existe deja avec cette adresse e-mail.');
  }

  const insert = await db.query<{ id: string }>(
    `insert into public.event_registrations
       (event_id, profile_id, full_name, email, phone, seats, note)
     values ($1,$2,$3,$4,$5,$6,$7) returning id`,
    [
      event.id,
      viewer?.id ?? null,
      input.fullName,
      input.email.toLowerCase(),
      input.phone ?? null,
      input.seats,
      input.note ?? null,
    ],
  );

  if (viewer) {
    await notifyProfiles(db, [viewer.id], {
      type: 'event.registration',
      title: 'Inscription enregistree',
      body: `Votre inscription a « ${event.title} » est confirmee.`,
      link: `/evenements/${event.slug}`,
    });
  }

  return { id: insert.rows[0].id, eventTitle: event.title, seats: input.seats };
}

export async function listEventRegistrations(eventId: string) {
  const db = getDatabase();
  const { rows } = await db.query<{
    id: string;
    full_name: string;
    email: string;
    phone: string | null;
    seats: number;
    status: string;
    created_at: string;
  }>(
    `select id, full_name, email, phone, seats, status, created_at
     from public.event_registrations where event_id = $1
     order by created_at asc`,
    [eventId],
  );
  return rows.map((row) => ({
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    seats: row.seats,
    status: row.status,
    createdAt: row.created_at,
  }));
}

export async function cancelRegistration(eventId: string, registrationId: string) {
  const db = getDatabase();
  const { rows } = await db.query<{ id: string }>(
    `update public.event_registrations set status = 'cancelled'
     where id = $1 and event_id = $2 returning id`,
    [registrationId, eventId],
  );
  if (!rows[0]) throw AppError.notFound('Inscription introuvable.');
}
