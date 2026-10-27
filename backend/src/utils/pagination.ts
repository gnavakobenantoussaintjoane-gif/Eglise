import { z } from 'zod';

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
});

export interface Pagination {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

export function resolvePagination(page: number, perPage: number) {
  return { limit: perPage, offset: (page - 1) * perPage };
}

export function buildPagination(page: number, perPage: number, total: number): Pagination {
  return {
    page,
    perPage,
    total,
    totalPages: Math.max(1, Math.ceil(total / perPage)),
  };
}

/** Terme de recherche compatible ILIKE, sans injection (valeur liee). */
export function likeTerm(term: string): string {
  return `%${term.replace(/[%_\\]/g, (match) => `\\${match}`)}%`;
}
