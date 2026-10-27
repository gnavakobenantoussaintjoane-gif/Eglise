import { z } from 'zod';
import { getDatabase } from '../../db/client.js';
import { buildPagination, resolvePagination, likeTerm } from '../../utils/pagination.js';

export async function dashboardStats() {
  const db = getDatabase();

  const counts = await db.query<{
    members_total: string;
    members_pending: string;
    members_approved: string;
    members_rejected: string;
    members_suspended: string;
    members_incomplete: string;
    departments_active: string;
    leaders_active: string;
    albums_total: string;
    albums_published: string;
    photos_total: string;
    sermons_published: string;
    events_upcoming: string;
    prayers_new: string;
    testimonies_pending: string;
    takedowns_pending: string;
  }>(`
    select
      (select count(*) from public.profiles)::text as members_total,
      (select count(*) from public.profiles where status = 'pending_review')::text as members_pending,
      (select count(*) from public.profiles where status = 'approved')::text as members_approved,
      (select count(*) from public.profiles where status = 'rejected')::text as members_rejected,
      (select count(*) from public.profiles where status = 'suspended')::text as members_suspended,
      (select count(*) from public.profiles where status = 'profile_incomplete')::text as members_incomplete,
      (select count(*) from public.departments where is_active and archived_at is null)::text as departments_active,
      -- Responsables actifs : personnes distinctes, tous departements confondus.
      (select count(distinct dm.profile_id)
         from public.department_members dm
         join public.departments d on d.id = dm.department_id
        where dm.status = 'active'
          and dm.member_role in ('leader', 'assistant')
          and d.is_active and d.archived_at is null)::text as leaders_active,
      (select count(*) from public.albums)::text as albums_total,
      (select count(*) from public.albums where status = 'published')::text as albums_published,
      (select count(*) from public.photos)::text as photos_total,
      (select count(*) from public.sermons where is_published)::text as sermons_published,
      (select count(*) from public.events where is_published and starts_at >= now())::text as events_upcoming,
      (select count(*) from public.prayer_requests where status = 'new')::text as prayers_new,
      (select count(*) from public.testimonies where status = 'pending')::text as testimonies_pending,
      (select count(*) from public.photo_takedown_requests where status = 'pending')::text as takedowns_pending
  `);

  const row = counts.rows[0];
  const n = (value: string | undefined) => Number(value ?? 0);

  const signupTrend = await db.query<{ month: string; total: string }>(
    `select to_char(date_trunc('month', created_at), 'YYYY-MM') as month, count(*)::text as total
     from public.profiles
     where created_at >= now() - interval '6 months'
     group by 1 order by 1`,
  );

  const pending = await db.query<{
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string;
    city: string | null;
    submitted_at: string | null;
  }>(
    `select id, first_name, last_name, email, city, submitted_at
     from public.profiles where status = 'pending_review'
     order by submitted_at asc nulls last limit 6`,
  );

  const recentAudit = await db.query<{
    action: string;
    entity_type: string | null;
    actor_email: string | null;
    created_at: string;
  }>(
    `select action, entity_type, actor_email, created_at
     from public.audit_logs order by created_at desc limit 8`,
  );

  const finance = await db.query<{ contributions: string; expenses: string }>(`
    select
      (select coalesce(sum(amount), 0) from public.contributions)::text as contributions,
      (select coalesce(sum(amount), 0) from public.expenses)::text as expenses
  `);

  return {
    members: {
      total: n(row?.members_total),
      pending: n(row?.members_pending),
      approved: n(row?.members_approved),
      rejected: n(row?.members_rejected),
      suspended: n(row?.members_suspended),
      incomplete: n(row?.members_incomplete),
    },
    departments: { active: n(row?.departments_active), leadersActive: n(row?.leaders_active) },
    albums: {
      total: n(row?.albums_total),
      published: n(row?.albums_published),
      photos: n(row?.photos_total),
    },
    sermons: { published: n(row?.sermons_published) },
    events: { upcoming: n(row?.events_upcoming) },
    prayerRequests: { new: n(row?.prayers_new) },
    testimonies: { pending: n(row?.testimonies_pending) },
    takedownRequests: { pending: n(row?.takedowns_pending) },
    finance: {
      contributions: Number(finance.rows[0]?.contributions ?? 0),
      expenses: Number(finance.rows[0]?.expenses ?? 0),
      balance:
        Number(finance.rows[0]?.contributions ?? 0) - Number(finance.rows[0]?.expenses ?? 0),
      currency: 'XOF',
    },
    signupTrend: signupTrend.rows.map((entry) => ({
      month: entry.month,
      total: Number(entry.total),
    })),
    pendingMembers: pending.rows.map((entry) => ({
      id: entry.id,
      fullName: `${entry.first_name ?? ''} ${entry.last_name ?? ''}`.trim(),
      email: entry.email,
      city: entry.city,
      submittedAt: entry.submitted_at,
    })),
    recentActivity: recentAudit.rows.map((entry) => ({
      action: entry.action,
      entityType: entry.entity_type,
      actorEmail: entry.actor_email,
      createdAt: entry.created_at,
    })),
  };
}

export const auditQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(30),
  search: z.string().trim().max(120).optional(),
  action: z.string().trim().max(120).optional(),
});

export async function listAuditLogs(query: z.infer<typeof auditQuerySchema>) {
  const db = getDatabase();
  const where: string[] = [];
  const params: unknown[] = [];
  if (query.action) {
    params.push(`${query.action}%`);
    where.push(`action like $${params.length}`);
  }
  if (query.search) {
    params.push(likeTerm(query.search));
    where.push(
      `(coalesce(actor_email,'') ilike $${params.length} escape '\\'
        or action ilike $${params.length} escape '\\'
        or coalesce(entity_id,'') ilike $${params.length} escape '\\')`,
    );
  }
  const whereSql = where.length ? `where ${where.join(' and ')}` : '';
  const { limit, offset } = resolvePagination(query.page, query.perPage);
  const total = await db.query<{ total: string }>(
    `select count(*)::text as total from public.audit_logs ${whereSql}`,
    params,
  );
  params.push(limit, offset);
  const { rows } = await db.query<{
    id: string;
    action: string;
    entity_type: string | null;
    entity_id: string | null;
    actor_email: string | null;
    metadata: Record<string, unknown>;
    created_at: string;
  }>(
    `select id, action, entity_type, entity_id, actor_email, metadata, created_at
     from public.audit_logs ${whereSql}
     order by created_at desc limit $${params.length - 1} offset $${params.length}`,
    params,
  );
  return {
    logs: rows.map((row) => ({
      id: row.id,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      actorEmail: row.actor_email,
      metadata: row.metadata,
      createdAt: row.created_at,
    })),
    pagination: buildPagination(query.page, query.perPage, Number(total.rows[0]?.total ?? 0)),
  };
}
