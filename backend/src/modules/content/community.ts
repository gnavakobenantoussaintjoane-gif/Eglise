import { z } from 'zod';
import { getDatabase } from '../../db/client.js';
import { AppError } from '../../utils/errors.js';
import { buildPagination, resolvePagination } from '../../utils/pagination.js';
import { recordAudit } from '../../middlewares/audit.js';
import { notifyAdmins, notifyProfiles } from '../../services/notifications.js';

/* -------------------------------------------------------------------------- */
/* Annonces                                                                   */
/* -------------------------------------------------------------------------- */

export const announcementInputSchema = z.object({
  title: z.string().trim().min(2, 'Titre requis.').max(160),
  body: z.string().trim().min(5, 'Contenu requis.').max(8000),
  audience: z.enum(['public', 'members']).default('public'),
  isPinned: z.boolean().optional(),
  publishedAt: z.string().trim().optional(),
  expiresAt: z.string().trim().nullish(),
});

interface AnnouncementRow {
  id: string;
  title: string;
  body: string;
  audience: 'public' | 'members';
  is_pinned: boolean;
  published_at: string;
  expires_at: string | null;
  created_at: string;
}

const mapAnnouncement = (row: AnnouncementRow) => ({
  id: row.id,
  title: row.title,
  body: row.body,
  audience: row.audience,
  isPinned: row.is_pinned,
  publishedAt: row.published_at,
  expiresAt: row.expires_at,
  createdAt: row.created_at,
});

export async function listAnnouncements(options: {
  audience: 'public' | 'members';
  includeExpired?: boolean;
  limit?: number;
}) {
  const db = getDatabase();
  const { rows } = await db.query<AnnouncementRow>(
    `select * from public.announcements
     where audience = $1 and published_at <= now()
       and ($2::boolean or expires_at is null or expires_at > now())
     order by is_pinned desc, published_at desc
     limit $3`,
    [options.audience, options.includeExpired ?? false, options.limit ?? 10],
  );
  return rows.map(mapAnnouncement);
}

export async function listAllAnnouncements(page: number, perPage: number) {
  const db = getDatabase();
  const { limit, offset } = resolvePagination(page, perPage);
  const total = await db.query<{ total: string }>('select count(*)::text as total from public.announcements');
  const { rows } = await db.query<AnnouncementRow>(
    `select * from public.announcements
     order by is_pinned desc, published_at desc limit $1 offset $2`,
    [limit, offset],
  );
  return {
    announcements: rows.map(mapAnnouncement),
    pagination: buildPagination(page, perPage, Number(total.rows[0]?.total ?? 0)),
  };
}

export async function createAnnouncement(
  input: z.infer<typeof announcementInputSchema>,
  actor: { id: string; email: string },
) {
  const db = getDatabase();
  const { rows } = await db.query<AnnouncementRow>(
    `insert into public.announcements
       (title, body, audience, is_pinned, published_at, expires_at, created_by)
     values ($1,$2,$3,$4, coalesce($5::timestamptz, now()), $6::timestamptz, $7)
     returning *`,
    [
      input.title,
      input.body,
      input.audience,
      input.isPinned ?? false,
      input.publishedAt || null,
      input.expiresAt || null,
      actor.id,
    ],
  );
  await recordAudit(db, {
    actorId: actor.id,
    actorEmail: actor.email,
    action: 'announcement.create',
    entityType: 'announcement',
    entityId: rows[0].id,
  });

  if (input.audience === 'members') {
    const members = await db.query<{ id: string }>(
      `select id from public.profiles where status = 'approved'`,
    );
    for (const member of members.rows) {
      await notifyProfiles(db, [member.id], {
        type: 'announcement',
        title: 'Nouvelle annonce',
        body: input.title,
        link: '/espace-membre/annonces',
      });
    }
  }
  if (input.isPinned) {
    await notifyAdmins(db, {
      type: 'announcement.pinned',
      title: 'Annonce epinglee',
      body: input.title,
      link: '/admin/annonces',
    });
  }
  return mapAnnouncement(rows[0]);
}

export async function updateAnnouncement(
  id: string,
  input: Partial<z.infer<typeof announcementInputSchema>>,
  actor: { id: string; email: string },
) {
  const db = getDatabase();
  const { rows } = await db.query<AnnouncementRow>(
    `update public.announcements set
       title = coalesce($2, title),
       body = coalesce($3, body),
       audience = coalesce($4, audience),
       is_pinned = coalesce($5, is_pinned),
       published_at = coalesce($6::timestamptz, published_at),
       expires_at = case when $7::boolean then $8::timestamptz else expires_at end
     where id = $1 returning *`,
    [
      id,
      input.title ?? null,
      input.body ?? null,
      input.audience ?? null,
      input.isPinned ?? null,
      input.publishedAt || null,
      input.expiresAt !== undefined,
      input.expiresAt || null,
    ],
  );
  if (!rows[0]) throw AppError.notFound('Annonce introuvable.');
  await recordAudit(db, {
    actorId: actor.id,
    actorEmail: actor.email,
    action: 'announcement.update',
    entityType: 'announcement',
    entityId: id,
  });
  return mapAnnouncement(rows[0]);
}

export async function deleteAnnouncement(id: string, actor: { id: string; email: string }) {
  const db = getDatabase();
  const { rows } = await db.query<{ id: string }>(
    'delete from public.announcements where id = $1 returning id',
    [id],
  );
  if (!rows[0]) throw AppError.notFound('Annonce introuvable.');
  await recordAudit(db, {
    actorId: actor.id,
    actorEmail: actor.email,
    action: 'announcement.delete',
    entityType: 'announcement',
    entityId: id,
  });
}

/* -------------------------------------------------------------------------- */
/* Demandes de priere                                                          */
/* -------------------------------------------------------------------------- */

export const prayerInputSchema = z.object({
  fullName: z.string().trim().min(2, 'Nom requis.').max(160),
  email: z.string().trim().email('E-mail invalide.').max(180).optional().or(z.literal('')),
  phone: z.string().trim().max(40).optional(),
  category: z.string().trim().max(80).optional(),
  message: z.string().trim().min(10, 'Merci de preciser votre sujet (10 caracteres min).').max(4000),
  isAnonymous: z.boolean().optional(),
});

interface PrayerRow {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  category: string | null;
  message: string;
  is_anonymous: boolean;
  is_private: boolean;
  status: 'new' | 'in_prayer' | 'closed';
  created_at: string;
  profile_id: string | null;
}

export async function createPrayerRequest(
  input: z.infer<typeof prayerInputSchema>,
  profileId: string | null,
) {
  const db = getDatabase();
  const { rows } = await db.query<PrayerRow>(
    `insert into public.prayer_requests
       (profile_id, full_name, email, phone, category, message, is_anonymous, is_private)
     values ($1,$2,$3,$4,$5,$6,$7,true) returning *`,
    [
      profileId,
      input.isAnonymous ? 'Anonyme' : input.fullName,
      input.email || null,
      input.phone || null,
      input.category ?? null,
      input.message,
      input.isAnonymous ?? false,
    ],
  );
  await notifyAdmins(db, {
    type: 'prayer.new',
    title: 'Nouvelle demande de priere',
    body: input.isAnonymous ? 'Demande anonyme recue.' : `Demande de ${input.fullName}.`,
    link: '/admin/priere',
  });
  return { id: rows[0].id, createdAt: rows[0].created_at };
}

export async function listPrayerRequests(
  options: { status?: string; page?: number; perPage?: number } = {},
) {
  const db = getDatabase();
  const page = options.page ?? 1;
  const perPage = options.perPage ?? 20;
  const { limit, offset } = resolvePagination(page, perPage);
  const params: unknown[] = [];
  let where = '';
  if (options.status) {
    params.push(options.status);
    where = 'where status = $1';
  }
  const total = await db.query<{ total: string }>(
    `select count(*)::text as total from public.prayer_requests ${where}`,
    params,
  );
  params.push(limit, offset);
  const { rows } = await db.query<PrayerRow>(
    `select * from public.prayer_requests ${where}
     order by (status = 'new') desc, created_at desc
     limit $${params.length - 1} offset $${params.length}`,
    params,
  );
  return {
    requests: rows.map((row) => ({
      id: row.id,
      fullName: row.full_name,
      email: row.email,
      phone: row.phone,
      category: row.category,
      message: row.message,
      isAnonymous: row.is_anonymous,
      status: row.status,
      createdAt: row.created_at,
    })),
    pagination: buildPagination(page, perPage, Number(total.rows[0]?.total ?? 0)),
  };
}

export async function updatePrayerStatus(
  id: string,
  status: 'new' | 'in_prayer' | 'closed',
  actor: { id: string; email: string },
) {
  const db = getDatabase();
  const { rows } = await db.query<PrayerRow>(
    `update public.prayer_requests
     set status = $2, handled_by = $3, handled_at = now()
     where id = $1 returning *`,
    [id, status, actor.id],
  );
  if (!rows[0]) throw AppError.notFound('Demande introuvable.');
  await recordAudit(db, {
    actorId: actor.id,
    actorEmail: actor.email,
    action: 'prayer.status',
    entityType: 'prayer_request',
    entityId: id,
    metadata: { status },
  });
  return { id: rows[0].id, status: rows[0].status };
}

/* -------------------------------------------------------------------------- */
/* Temoignages                                                                 */
/* -------------------------------------------------------------------------- */

export const testimonyInputSchema = z.object({
  title: z.string().trim().min(3, 'Titre requis.').max(160),
  body: z.string().trim().min(20, 'Merci de detailler votre temoignage (20 caracteres min).').max(6000),
  authorName: z.string().trim().min(2, 'Nom requis.').max(120).optional(),
  isPublic: z.boolean().optional(),
});

interface TestimonyRow {
  id: string;
  profile_id: string | null;
  author_name: string;
  title: string;
  body: string;
  status: 'pending' | 'approved' | 'rejected';
  is_public: boolean;
  created_at: string;
}

const mapTestimony = (row: TestimonyRow, profileName?: string) => ({
  id: row.id,
  authorName: profileName?.trim() || row.author_name,
  title: row.title,
  body: row.body,
  status: row.status,
  isPublic: row.is_public,
  createdAt: row.created_at,
});

export async function listPublicTestimonies(limit = 12) {
  const db = getDatabase();
  const { rows } = await db.query<TestimonyRow>(
    `select * from public.testimonies
     where status = 'approved' and is_public = true
     order by moderated_at desc nulls last, created_at desc
     limit $1`,
    [limit],
  );
  return rows.map((row) => mapTestimony(row));
}

export async function createTestimony(
  input: z.infer<typeof testimonyInputSchema>,
  profile: { id: string; firstName: string; lastName: string },
) {
  const db = getDatabase();
  const authorName = input.authorName?.trim() || `${profile.firstName} ${profile.lastName}`.trim();
  const { rows } = await db.query<TestimonyRow>(
    `insert into public.testimonies (profile_id, author_name, title, body, is_public)
     values ($1,$2,$3,$4,$5) returning *`,
    [profile.id, authorName, input.title, input.body, input.isPublic ?? true],
  );
  await notifyAdmins(db, {
    type: 'testimony.pending',
    title: 'Temoignage a moderer',
    body: input.title,
    link: '/admin/temoignages',
  });
  return mapTestimony(rows[0]);
}

export async function listTestimoniesForAdmin(status?: string) {
  const db = getDatabase();
  const params: unknown[] = [];
  let where = '';
  if (status) {
    params.push(status);
    where = 'where t.status = $1';
  }
  const { rows } = await db.query<TestimonyRow & { first_name: string | null; last_name: string | null }>(
    `select t.*, p.first_name, p.last_name from public.testimonies t
     left join public.profiles p on p.id = t.profile_id
     ${where} order by t.created_at desc limit 100`,
    params,
  );
  return rows.map((row) =>
    mapTestimony(row, `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim()),
  );
}

export async function moderateTestimony(
  id: string,
  status: 'approved' | 'rejected',
  actor: { id: string; email: string },
) {
  const db = getDatabase();
  const { rows } = await db.query<TestimonyRow>(
    `update public.testimonies set status = $2, moderated_by = $3, moderated_at = now()
     where id = $1 returning *`,
    [id, status, actor.id],
  );
  if (!rows[0]) throw AppError.notFound('Temoignage introuvable.');
  if (rows[0].profile_id) {
    await notifyProfiles(db, [rows[0].profile_id], {
      type: 'testimony.moderated',
      title:
        status === 'approved'
          ? 'Votre temoignage est publie'
          : 'Votre temoignage n a pas ete retenu',
      body: rows[0].title,
      link: '/temoignages',
    });
  }
  await recordAudit(db, {
    actorId: actor.id,
    actorEmail: actor.email,
    action: `testimony.${status}`,
    entityType: 'testimony',
    entityId: id,
  });
  return { id: rows[0].id, status: rows[0].status };
}
