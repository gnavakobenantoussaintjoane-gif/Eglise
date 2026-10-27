import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';
import { AppError } from '../utils/errors.js';

interface ValidationSchemas {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
}

/**
 * Valide et normalise les entrees. Les valeurs parsees sont exposees via
 * `req.validated` : on ne reecrit pas `req.query` (lecture seule en Express 5).
 */
export function validate(schemas: ValidationSchemas): RequestHandler {
  return (req, _res, next) => {
    try {
      const validated: { body?: unknown; query?: unknown; params?: unknown } = {};
      if (schemas.body) validated.body = schemas.body.parse(req.body ?? {});
      if (schemas.query) validated.query = schemas.query.parse(req.query ?? {});
      if (schemas.params) validated.params = schemas.params.parse(req.params ?? {});
      req.validated = validated;
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function bodyOf<T>(req: { validated: { body?: unknown } }): T {
  if (req.validated.body === undefined) {
    throw AppError.internal('Corps de requete non valide.');
  }
  return req.validated.body as T;
}

export function queryOf<T>(req: { validated: { query?: unknown } }): T {
  return (req.validated.query ?? {}) as T;
}

export function paramsOf<T>(req: { validated: { params?: unknown } }): T {
  return (req.validated.params ?? {}) as T;
}
