import { z } from 'zod';
import { getDatabase } from '../../db/client.js';
import { AppError } from '../../utils/errors.js';
import { isApproved, isMedia, type AuthProfile } from '../../auth/permissions.js';
import { uniqueSlug } from '../../utils/slug.js';
import { buildPagination, resolvePagination, likeTerm, type Pagination } from '../../utils/pagination.js';
import { recordAudit } from '../../middlewares/audit.js';
import { signedFileUrl, signedFileUrls, removeStoredFile } from '../../services/files.js';
import { notifyProfiles } from '../../services/notifications.js';

export const albumInputSchema = z.object({
  title: z.string().trim().min(2, 'Titre requis.').max(140),
  description: z.string().trim().max(3000).nullish(),
  category: z.string().trim().max(80).nullish(),
  eventDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format AAAA-MM-JJ.')
    .nullish(),
  access: z.enum(['public', 'members', 'restricted']).default('members'),
  status: z.enum(['draft', 'published', 'archived']).default('draft'),
});

export type AlbumInput = z.infer<typeof albumInputSchema>;

export const albumQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(60).default(12),
  search: z.string().trim().max(120).optional(),
  category: z.string().trim().max(80).optional(),
  access: z.enum(['public', 'members', 'restricted']).optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
});

export interface PhotoRow {
  id: string;
  album_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  caption: string | null;
  taken_at: string | null;
  sort_order: number;
  created_at: string;
}

export interface AlbumRow {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  category: string | null;
  event_date: string | null;
  access: 'public' | 'members' | 'restricted';
  status: 'draft' | 'published' | 'archived';
  cover_photo_id: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  photo_count?: string | number;
}

export interface PhotoDto {
  id: string;
  url: string | null;
  caption: string | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  takenAt: string | null;
  sortOrder: number;
  createdAt: string;
}

export interface AlbumDto {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  category: string | null;
  eventDate: string | null;
  access: AlbumRow['access'];
  status: AlbumRow['status'];
  coverUrl: string | null;
  photoCount: number;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  photos?: PhotoDto[];
  downloadEnabled: boolean;
}

/** Clause SQL de visibilite, miroir de la politique RLS `can_view_album`. */
export function albumVisibility(viewer: AuthProfile | null): {
  clause: string;
  params: unknown[];
} {
  if (viewer && isMedia(viewer)) return { clause: 'true', params: [] };
  const approved = viewer ? isApproved(viewer) : false;
  return {
    clause: `(
      a.status = 'published'
      and (
        a.access = 'public'
        or (a.access = 'members' and $1::boolean)
        or (a.access = 'restricted' and $1::boolean and exists (
          select 1 from public.album_access aa
          where aa.album_id = a.id and aa.profile_id = $2::uuid
        ))
      )
    )`,
    params: [approved, viewer?.id ?? null],
  };
}

async function mapPhotos(rows: PhotoRow[]): Promise<PhotoDto[]> {
  const urls = await signedFileUrls(rows.map((row) => row.storage_path), 900);
  return rows.map((row) => ({
    id: row.id,
    url: urls.get(row.storage_path) ?? null,
    caption: row.caption,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    takenAt: row.taken_at,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  }));
}

export async function mapAlbum(row: AlbumRow, options: { withPhotos?: boolean } = {}): Promise<AlbumDto> {
  const db = getDatabase();
  const coverPath = row.cover_photo_id
    ? (
        await db.query<{ storage_path: string }>(
          'select storage_path from public.photos where id = $1',
          [row.cover_photo_id],
        )
      ).rows[0]?.storage_path ?? null
    : null;

  const photos = options.withPhotos
    ? await mapPhotos(
        (
          await db.query<PhotoRow>(
            'select * from public.photos where album_id = $1 order by sort_order asc, created_at asc',
            [row.id],
          )
        ).rows,
      )
    : undefined;

  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    description: row.description,
    category: row.category,
    eventDate: row.event_date,
    access: row.access,
    status: row.status,
    coverUrl: photos?.find((photo) => photo.url)?.url ?? (await signedFileUrl(coverPath, 900)),
    photoCount: Number(row.photo_count ?? photos?.length ?? 0),
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    photos,
    downloadEnabled: row.access !== 'restricted',
  };
}

export async function listAlbums(
  viewer: AuthProfile | null,
  query: z.infer<typeof albumQuerySchema>,
  options: { manage?: boolean } = {},
): Promise<{ albums: AlbumDto[]; pagination: Pagination }> {
  const db = getDatabase();
  const visibility = albumVisibility(viewer);
  const where: string[] = [];
  const params: unknown[] = [...visibility.params];

  if (!options.manage) {
    where.push(visibility.clause);
  } else {
    where.push('true');
    if (query.status) {
      params.push(query.status);
      where.push(`a.status = $${params.length}`);
    }
  }

  if (query.access) {
    params.push(query.access);
    where.push(`a.access = $${params.length}`);
  }
  if (query.category) {
    params.push(query.category);
    where.push(`a.category = $${params.length}`);
  }
  if (query.search) {
    params.push(likeTerm(query.search));
    where.push(
      `(a.title ilike $${params.length} escape '\\' or coalesce(a.description, '') ilike $${params.length} escape '\\')`,
    );
  }

  const { limit, offset } = resolvePagination(query.page, query.perPage);
  const countResult = await db.query<{ total: string }>(
    `select count(*)::text as total from public.albums a where ${where.join(' and ')}`,
    params,
  );
  const total = Number(countResult.rows[0]?.total ?? 0);

  params.push(limit, offset);
  const { rows } = await db.query<AlbumRow>(
    `select a.*, (select count(*) from public.photos p where p.album_id = a.id) as photo_count
     from public.albums a
     where ${where.join(' and ')}
     order by coalesce(a.event_date, a.created_at::date) desc, a.created_at desc
     limit $${params.length - 1} offset $${params.length}`,
    params,
  );

  const albums = await Promise.all(rows.map((row) => mapAlbum(row)));
  return { albums, pagination: buildPagination(query.page, query.perPage, total) };
}

export async function getAlbum(
  viewer: AuthProfile | null,
  identifier: string,
  options: { byId?: boolean; manage?: boolean } = {},
): Promise<AlbumDto> {
  const db = getDatabase();
  const visibility = albumVisibility(viewer);
  const params: unknown[] = [identifier, ...visibility.params];
  const selector = options.byId ? 'a.id = $1' : 'a.slug = $1';
  const clause = options.manage ? 'true' : visibility.clause.replace(/\$1::boolean/g, '$2::boolean').replace(/\$2::uuid/g, '$3::uuid');

  const { rows } = await db.query<AlbumRow>(
    `select a.* from public.albums a
     where ${selector} and ${clause}
     limit 1`,
    params,
  );
  if (!rows[0]) throw AppError.notFound('Album introuvable ou non accessible.');

  const album = rows[0];
  const photos = await db.query<PhotoRow>(
    'select * from public.photos where album_id = $1 order by sort_order asc, created_at asc',
    [album.id],
  );

  return {
    ...(await mapAlbum(album)),
    photos: await mapPhotos(photos.rows),
    photoCount: photos.rows.length,
  };
}

export async function createAlbum(input: AlbumInput, actor: AuthProfile): Promise<AlbumDto> {
  const db = getDatabase();
  const slug = await uniqueSlug(db, 'albums', input.title);
  const { rows } = await db.query<AlbumRow>(
    `insert into public.albums
       (title, slug, description, category, event_date, access, status, created_by, published_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8, case when $7 = 'published' then now() else null end)
     returning *`,
    [
      input.title,
      slug,
      input.description ?? null,
      input.category ?? null,
      input.eventDate ?? null,
      input.access,
      input.status,
      actor.id,
    ],
  );
  await recordAudit(db, {
    actorId: actor.id,
    actorEmail: actor.email,
    action: 'album.create',
    entityType: 'album',
    entityId: rows[0].id,
    metadata: { title: input.title, access: input.access },
  });
  return mapAlbum(rows[0]);
}

export async function updateAlbum(
  id: string,
  input: Partial<AlbumInput> & { coverPhotoId?: string | null },
  actor: AuthProfile,
): Promise<AlbumDto> {
  const db = getDatabase();
  const existing = await db.query<AlbumRow>('select * from public.albums where id = $1', [id]);
  if (!existing.rows[0]) throw AppError.notFound('Album introuvable.');

  const publishNow = input.status === 'published' && existing.rows[0].status !== 'published';
  const { rows } = await db.query<AlbumRow>(
    `update public.albums set
       title = coalesce($2, title),
       description = case when $3::boolean then $4 else description end,
       category = case when $5::boolean then $6 else category end,
       event_date = case when $7::boolean then $8::date else event_date end,
       access = coalesce($9, access),
       status = coalesce($10, status),
       cover_photo_id = case when $11::boolean then $12::uuid else cover_photo_id end,
       published_at = case when $13::boolean then coalesce(published_at, now()) else published_at end
     where id = $1
     returning *`,
    [
      id,
      input.title ?? null,
      input.description !== undefined,
      input.description ?? null,
      input.category !== undefined,
      input.category ?? null,
      input.eventDate !== undefined,
      input.eventDate ?? null,
      input.access ?? null,
      input.status ?? null,
      input.coverPhotoId !== undefined,
      input.coverPhotoId ?? null,
      publishNow,
    ],
  );
  await recordAudit(db, {
    actorId: actor.id,
    actorEmail: actor.email,
    action: 'album.update',
    entityType: 'album',
    entityId: id,
    metadata: { fields: Object.keys(input) },
  });
  return mapAlbum(rows[0]);
}

export async function deleteAlbum(id: string, actor: AuthProfile): Promise<void> {
  const db = getDatabase();
  const photos = await db.query<PhotoRow>('select * from public.photos where album_id = $1', [id]);
  await db.query('delete from public.albums where id = $1', [id]);
  await Promise.all(photos.rows.map((photo) => removeStoredFile(photo.storage_path)));
  await recordAudit(db, {
    actorId: actor.id,
    actorEmail: actor.email,
    action: 'album.delete',
    entityType: 'album',
    entityId: id,
    metadata: { photos: photos.rows.length },
  });
}

export async function albumCoverPath(albumId: string): Promise<string | null> {
  const db = getDatabase();
  const { rows } = await db.query<{ storage_path: string }>(
    `select p.storage_path from public.albums a
     join public.photos p on p.id = a.cover_photo_id
     where a.id = $1`,
    [albumId],
  );
  return rows[0]?.storage_path ?? null;
}

export async function albumPhotoPaths(albumId: string): Promise<{ storage_path: string; file_name: string }[]> {
  const db = getDatabase();
  const { rows } = await db.query<{ storage_path: string; file_name: string }>(
    'select storage_path, file_name from public.photos where album_id = $1 order by sort_order asc, created_at asc',
    [albumId],
  );
  return rows;
}

export async function addPhoto(
  albumId: string,
  input: {
    storagePath: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    caption?: string | null;
    takenAt?: string | null;
  },
  actor: AuthProfile,
): Promise<PhotoDto> {
  const db = getDatabase();
  const count = await db.query<{ total: string }>(
    'select count(*)::text as total from public.photos where album_id = $1',
    [albumId],
  );
  const { rows } = await db.query<PhotoRow>(
    `insert into public.photos
       (album_id, storage_path, file_name, mime_type, size_bytes, caption, taken_at, sort_order, created_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     returning *`,
    [
      albumId,
      input.storagePath,
      input.fileName,
      input.mimeType,
      input.sizeBytes,
      input.caption ?? null,
      input.takenAt ?? null,
      Number(count.rows[0]?.total ?? 0),
      actor.id,
    ],
  );
  await db.query(
    `update public.albums set cover_photo_id = coalesce(cover_photo_id, $2), updated_at = now()
     where id = $1`,
    [albumId, rows[0].id],
  );
  return (await mapPhotos(rows))[0];
}

export async function updatePhoto(
  photoId: string,
  input: { caption?: string | null; sortOrder?: number; takenAt?: string | null },
  actor: AuthProfile,
): Promise<PhotoDto> {
  const db = getDatabase();
  const { rows } = await db.query<PhotoRow>(
    `update public.photos set
       caption = case when $2::boolean then $3 else caption end,
       sort_order = coalesce($4, sort_order),
       taken_at = case when $5::boolean then $6 else taken_at end
     where id = $1 returning *`,
    [
      photoId,
      input.caption !== undefined,
      input.caption ?? null,
      input.sortOrder ?? null,
      input.takenAt !== undefined,
      input.takenAt ?? null,
    ],
  );
  if (!rows[0]) throw AppError.notFound('Photo introuvable.');
  await recordAudit(db, {
    actorId: actor.id,
    actorEmail: actor.email,
    action: 'photo.update',
    entityType: 'photo',
    entityId: photoId,
    metadata: { fields: Object.keys(input) },
  });
  return (await mapPhotos(rows))[0];
}

export async function deletePhoto(photoId: string, actor: AuthProfile): Promise<void> {
  const db = getDatabase();
  const { rows } = await db.query<PhotoRow>('select * from public.photos where id = $1', [photoId]);
  const photo = rows[0];
  if (!photo) throw AppError.notFound('Photo introuvable.');
  await db.query('delete from public.photos where id = $1', [photoId]);
  await removeStoredFile(photo.storage_path);
  await recordAudit(db, {
    actorId: actor.id,
    actorEmail: actor.email,
    action: 'photo.delete',
    entityType: 'photo',
    entityId: photoId,
  });
}

export async function listAlbumGrants(albumId: string) {
  const db = getDatabase();
  const { rows } = await db.query<{
    profile_id: string;
    first_name: string | null;
    last_name: string | null;
    email: string;
    created_at: string;
  }>(
    `select aa.profile_id, p.first_name, p.last_name, p.email, aa.created_at
     from public.album_access aa
     join public.profiles p on p.id = aa.profile_id
     where aa.album_id = $1
     order by aa.created_at desc`,
    [albumId],
  );
  return rows.map((row) => ({
    profileId: row.profile_id,
    fullName: `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim(),
    email: row.email,
    createdAt: row.created_at,
  }));
}

export async function grantAlbumAccess(
  albumId: string,
  profileId: string,
  actor: AuthProfile,
): Promise<void> {
  const db = getDatabase();
  const album = await db.query<AlbumRow>('select * from public.albums where id = $1', [albumId]);
  if (!album.rows[0]) throw AppError.notFound('Album introuvable.');
  if (album.rows[0].access !== 'restricted') {
    throw AppError.badRequest("Les droits nominatifs concernent uniquement les albums 'restricted'.");
  }
  await db.query(
    `insert into public.album_access (album_id, profile_id, granted_by)
     values ($1, $2, $3) on conflict (album_id, profile_id) do nothing`,
    [albumId, profileId, actor.id],
  );
  await notifyProfiles(db, [profileId], {
    type: 'album.access_granted',
    title: 'Acces a un album prive',
    body: `Vous avez recu l'acces a l'album « ${album.rows[0].title} ».`,
    link: `/galerie/${album.rows[0].slug}`,
  });
  await recordAudit(db, {
    actorId: actor.id,
    actorEmail: actor.email,
    action: 'album.grant_access',
    entityType: 'album',
    entityId: albumId,
    metadata: { profileId },
  });
}

export async function revokeAlbumAccess(
  albumId: string,
  profileId: string,
  actor: AuthProfile,
): Promise<void> {
  const db = getDatabase();
  await db.query('delete from public.album_access where album_id = $1 and profile_id = $2', [
    albumId,
    profileId,
  ]);
  await recordAudit(db, {
    actorId: actor.id,
    actorEmail: actor.email,
    action: 'album.revoke_access',
    entityType: 'album',
    entityId: albumId,
    metadata: { profileId },
  });
}
