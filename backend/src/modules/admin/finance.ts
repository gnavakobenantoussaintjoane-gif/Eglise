import { z } from 'zod';
import { getDatabase } from '../../db/client.js';
import { AppError } from '../../utils/errors.js';
import { buildPagination, resolvePagination } from '../../utils/pagination.js';
import { recordAudit } from '../../middlewares/audit.js';
import type { AuthProfile } from '../../auth/permissions.js';

export const contributionInputSchema = z.object({
  donorName: z.string().trim().min(2, 'Nom requis.').max(160),
  amount: z.coerce.number().min(0).max(1_000_000_000),
  currency: z.string().trim().length(3).default('XOF'),
  method: z.enum(['especes', 'mobile_money', 'virement', 'cheque', 'autre']).default('especes'),
  category: z.enum(['dime', 'offrande', 'don', 'projet', 'autre']).default('offrande'),
  receivedOn: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  note: z.string().trim().max(800).optional(),
  profileId: z.string().uuid().nullish(),
});

export const expenseInputSchema = z.object({
  label: z.string().trim().min(2, 'Libelle requis.').max(160),
  amount: z.coerce.number().min(0).max(1_000_000_000),
  currency: z.string().trim().length(3).default('XOF'),
  category: z.string().trim().min(2).max(80).default('fonctionnement'),
  spentOn: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  note: z.string().trim().max(800).optional(),
});

export async function financeSummary() {
  const db = getDatabase();
  const totals = await db.query<{ contributions: string; expenses: string }>(
    `select
      (select coalesce(sum(amount),0) from public.contributions)::text as contributions,
      (select coalesce(sum(amount),0) from public.expenses)::text as expenses`,
  );
  const byCategory = await db.query<{ category: string; total: string }>(
    `select category, coalesce(sum(amount),0)::text as total
     from public.contributions group by category order by 2 desc`,
  );
  const contributions = Number(totals.rows[0]?.contributions ?? 0);
  const expenses = Number(totals.rows[0]?.expenses ?? 0);
  return {
    contributions,
    expenses,
    balance: contributions - expenses,
    currency: 'XOF',
    byCategory: byCategory.rows.map((row) => ({
      category: row.category,
      total: Number(row.total),
    })),
  };
}

export async function listContributions(page: number, perPage: number) {
  const db = getDatabase();
  const { limit, offset } = resolvePagination(page, perPage);
  const total = await db.query<{ total: string }>(
    'select count(*)::text as total from public.contributions',
  );
  const { rows } = await db.query<{
    id: string;
    donor_name: string;
    amount: string;
    currency: string;
    method: string;
    category: string;
    received_on: string;
    note: string | null;
  }>(
    `select id, donor_name, amount, currency, method, category, received_on, note
     from public.contributions order by received_on desc, created_at desc limit $1 offset $2`,
    [limit, offset],
  );
  return {
    items: rows.map((row) => ({
      id: row.id,
      donorName: row.donor_name,
      amount: Number(row.amount),
      currency: row.currency,
      method: row.method,
      category: row.category,
      receivedOn: row.received_on,
      note: row.note,
    })),
    pagination: buildPagination(page, perPage, Number(total.rows[0]?.total ?? 0)),
  };
}

export async function createContribution(
  input: z.infer<typeof contributionInputSchema>,
  actor: AuthProfile,
) {
  const db = getDatabase();
  const { rows } = await db.query<{ id: string }>(
    `insert into public.contributions
       (profile_id, donor_name, amount, currency, method, category, received_on, note, recorded_by)
     values ($1,$2,$3,$4,$5,$6, coalesce($7::date, current_date), $8, $9)
     returning id`,
    [
      input.profileId ?? null,
      input.donorName,
      input.amount,
      input.currency,
      input.method,
      input.category,
      input.receivedOn ?? null,
      input.note ?? null,
      actor.id,
    ],
  );
  await recordAudit(db, {
    actorId: actor.id,
    actorEmail: actor.email,
    action: 'finance.contribution.create',
    entityType: 'contribution',
    entityId: rows[0].id,
    metadata: { amount: input.amount, category: input.category },
  });
  return { id: rows[0].id };
}

export async function deleteContribution(id: string, actor: AuthProfile) {
  const db = getDatabase();
  const { rowCount } = await db.query('delete from public.contributions where id = $1', [id]);
  if (rowCount === 0) throw AppError.notFound('Contribution introuvable.');
  await recordAudit(db, {
    actorId: actor.id,
    actorEmail: actor.email,
    action: 'finance.contribution.delete',
    entityType: 'contribution',
    entityId: id,
  });
}

export async function listExpenses(page: number, perPage: number) {
  const db = getDatabase();
  const { limit, offset } = resolvePagination(page, perPage);
  const total = await db.query<{ total: string }>(
    'select count(*)::text as total from public.expenses',
  );
  const { rows } = await db.query<{
    id: string;
    label: string;
    amount: string;
    currency: string;
    category: string;
    spent_on: string;
    note: string | null;
  }>(
    `select id, label, amount, currency, category, spent_on, note
     from public.expenses order by spent_on desc, created_at desc limit $1 offset $2`,
    [limit, offset],
  );
  return {
    items: rows.map((row) => ({
      id: row.id,
      label: row.label,
      amount: Number(row.amount),
      currency: row.currency,
      category: row.category,
      spentOn: row.spent_on,
      note: row.note,
    })),
    pagination: buildPagination(page, perPage, Number(total.rows[0]?.total ?? 0)),
  };
}

export async function createExpense(input: z.infer<typeof expenseInputSchema>, actor: AuthProfile) {
  const db = getDatabase();
  const { rows } = await db.query<{ id: string }>(
    `insert into public.expenses (label, amount, currency, category, spent_on, note, recorded_by)
     values ($1,$2,$3,$4, coalesce($5::date, current_date), $6, $7)
     returning id`,
    [
      input.label,
      input.amount,
      input.currency,
      input.category,
      input.spentOn ?? null,
      input.note ?? null,
      actor.id,
    ],
  );
  await recordAudit(db, {
    actorId: actor.id,
    actorEmail: actor.email,
    action: 'finance.expense.create',
    entityType: 'expense',
    entityId: rows[0].id,
    metadata: { amount: input.amount },
  });
  return { id: rows[0].id };
}

export async function deleteExpense(id: string, actor: AuthProfile) {
  const db = getDatabase();
  const { rowCount } = await db.query('delete from public.expenses where id = $1', [id]);
  if (rowCount === 0) throw AppError.notFound('Depense introuvable.');
  await recordAudit(db, {
    actorId: actor.id,
    actorEmail: actor.email,
    action: 'finance.expense.delete',
    entityType: 'expense',
    entityId: id,
  });
}
