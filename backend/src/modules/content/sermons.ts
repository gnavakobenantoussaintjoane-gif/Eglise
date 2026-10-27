import { z } from 'zod';
import { getDatabase } from '../../db/client.js';
import { AppError } from '../../utils/errors.js';
import { uniqueSlug } from '../../utils/slug.js';
import { buildPagination, resolvePagination, likeTerm } from '../../utils/pagination.js';
import { signedFileUrl, removeStoredFile } from '../../services/files.js';
import { recordAudit } from '../../middlewares/audit.js';

export const sermonInputSchema = z.object({
  title: z.string().trim().min(2, 'Titre requis.').max(160),
  speaker: z.string().trim().min(2, 'Predicateur requis.').max(120),
  series: z.string().trim().max(120).nullish(),
  scripture: z.string().trim().max(160).nullish(),
  summary: z.string().trim().max(4000).nullish(),
  preachedOn: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format AAAA-MM-JJ.')
    .optional(),
  videoUrl: z.string().trim().url('URL video invalide.').max(500).nullish(),
  isPublished: z.boolean().optional(),
});

export type SermonInput = z.infer<typeof sermonInputSchema>;

export const sermonQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(50).default(10),
  search: z.string().trim().max(120).optional(),
  series: z.string().trim().max(120).optional(),
  includeDrafts: z.coerce.boolean().optional(),
});

interface SermonRow {
  id: string;
  title: string;
  slug: string;
  speaker: string;
  series: string | null;
  scripture: string | null;
  summary: string | null;
  preached_on: string;
  audio_path: string | null;
  video_url: string | null;
  document_path: string | null;
  is_published: boolean;
  created_at: string;
}

async function mapSermon(row: SermonRow) {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    speaker: row.speaker,
    series: row.series,
    scripture: row.scripture,
    summary: row.summary,
    preachedOn: row.preached_on,
    audioUrl: await signedFileUrl(row.audio_path, 3600),
    documentUrl: await signedFileUrl(row.document_path, 3600),
    videoUrl: row.video_url,
    isPublished: row.is_published,
    createdAt: row.created_at,
  };
}

export async function listSermons(query: z.infer<typeof sermonQuerySchema>, includeDrafts = false) {
  const db = getDatabase();
  const where: string[] = [];
  const params: unknown[] = [];
  if (!includeDrafts) where.push('is_published = true');
  if (query.search) {
    params.push(likeTerm(query.search));
    where.push(
      `(title ilike $${params.length} escape '\\' or speaker ilike $${params.length} escape '\\'
        or coalesce(scripture, '') ilike $${params.length} escape '\\')`,
    );
  }
  if (query.series) {
    params.push(query.series);
    where.push(`series = $${params.length}`);
  }
  const whereSql = where.length ? `where ${where.join(' and ')}` : '';
  const { limit, offset } = resolvePagination(query.page, query.perPage);
  const total = await db.query<{ total: string }>(
    `select count(*)::text as total from public.sermons ${whereSql}`,
    params,
  );
  params.push(limit, offset);
  const { rows } = await db.query<SermonRow>(
    `select * from public.sermons ${whereSql}
     order by preached_on desc, created_at desc
     limit $${params.length - 1} offset $${params.length}`,
    params,
  );
  return {
    sermons: await Promise.all(rows.map(mapSermon)),
    pagination: buildPagination(query.page, query.perPage, Number(total.rows[0]?.total ?? 0)),
  };
}

export async function getSermon(slug: string, includeDrafts = false) {
  const db = getDatabase();
  const { rows } = await db.query<SermonRow>('select * from public.sermons where slug = $1', [slug]);
  const sermon = rows[0];
  if (!sermon || (!includeDrafts && !sermon.is_published)) {
    throw AppError.notFound('Predication introuvable.');
  }
  return mapSermon(sermon);
}

export async function createSermon(input: SermonInput, actor: { id: string; email: string }) {
  const db = getDatabase();
  const slug = await uniqueSlug(db, 'sermons', input.title);
  const { rows } = await db.query<SermonRow>(
    `insert into public.sermons
       (title, slug, speaker, series, scripture, summary, preached_on, video_url, is_published, created_by)
     values ($1,$2,$3,$4,$5,$6, coalesce($7::date, current_date), $8, $9, $10)
     returning *`,
    [
      input.title,
      slug,
      input.speaker,
      input.series ?? null,
      input.scripture ?? null,
      input.summary ?? null,
      input.preachedOn ?? null,
      input.videoUrl ?? null,
      input.isPublished ?? false,
      actor.id,
    ],
  );
  await recordAudit(db, {
    actorId: actor.id,
    actorEmail: actor.email,
    action: 'sermon.create',
    entityType: 'sermon',
    entityId: rows[0].id,
  });
  return mapSermon(rows[0]);
}

export async function updateSermon(
  id: string,
  input: Partial<SermonInput>,
  actor: { id: string; email: string },
) {
  const db = getDatabase();
  const { rows } = await db.query<SermonRow>(
    `update public.sermons set
       title = coalesce($2, title),
       speaker = coalesce($3, speaker),
       series = case when $4::boolean then $5 else series end,
       scripture = case when $6::boolean then $7 else scripture end,
       summary = case when $8::boolean then $9 else summary end,
       preached_on = coalesce($10::date, preached_on),
       video_url = case when $11::boolean then $12 else video_url end,
       is_published = coalesce($13, is_published)
     where id = $1 returning *`,
    [
      id,
      input.title ?? null,
      input.speaker ?? null,
      input.series !== undefined,
      input.series ?? null,
      input.scripture !== undefined,
      input.scripture ?? null,
      input.summary !== undefined,
      input.summary ?? null,
      input.preachedOn ?? null,
      input.videoUrl !== undefined,
      input.videoUrl ?? null,
      input.isPublished ?? null,
    ],
  );
  if (!rows[0]) throw AppError.notFound('Predication introuvable.');
  await recordAudit(db, {
    actorId: actor.id,
    actorEmail: actor.email,
    action: 'sermon.update',
    entityType: 'sermon',
    entityId: id,
    metadata: { fields: Object.keys(input) },
  });
  return mapSermon(rows[0]);
}

export async function setSermonMedia(
  id: string,
  kind: 'audio' | 'document',
  storagePath: string,
  actor: { id: string; email: string },
) {
  const db = getDatabase();
  const column = kind === 'audio' ? 'audio_path' : 'document_path';
  const previous = await db.query<Record<string, string | null>>(
    `select ${column} from public.sermons where id = $1`,
    [id],
  );
  if (!previous.rows[0]) throw AppError.notFound('Predication introuvable.');
  const { rows } = await db.query<SermonRow>(
    `update public.sermons set ${column} = $2 where id = $1 returning *`,
    [id, storagePath],
  );
  await removeStoredFile(previous.rows[0][column]);
  await recordAudit(db, {
    actorId: actor.id,
    actorEmail: actor.email,
    action: `sermon.${kind}_upload`,
    entityType: 'sermon',
    entityId: id,
  });
  return mapSermon(rows[0]);
}

export async function deleteSermon(id: string, actor: { id: string; email: string }) {
  const db = getDatabase();
  const { rows } = await db.query<SermonRow>('select * from public.sermons where id = $1', [id]);
  if (!rows[0]) throw AppError.notFound('Predication introuvable.');
  await db.query('delete from public.sermons where id = $1', [id]);
  await removeStoredFile(rows[0].audio_path);
  await removeStoredFile(rows[0].document_path);
  await recordAudit(db, {
    actorId: actor.id,
    actorEmail: actor.email,
    action: 'sermon.delete',
    entityType: 'sermon',
    entityId: id,
  });
}
