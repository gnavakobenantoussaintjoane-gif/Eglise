import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../utils/errors.js';
import { isProduction } from '../config/env.js';
import { logger } from '../utils/logger.js';

export const asyncHandler =
  <T extends RequestHandler>(handler: T): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: 'Route inexistante.' },
  });
}

interface PgLikeError {
  code?: string;
  constraint?: string;
  detail?: string;
}

function translateDatabaseError(error: PgLikeError): AppError | null {
  switch (error.code) {
    case '23505': // unique_violation
      return new AppError(409, 'CONFLICT', 'Cette valeur existe deja.', {
        constraint: error.constraint,
      });
    case '23503': // foreign_key_violation
      return new AppError(400, 'INVALID_REFERENCE', 'Reference associee inexistante.', {
        constraint: error.constraint,
      });
    case '23514': // check_violation
      return new AppError(400, 'INVALID_VALUE', 'Valeur refusee par une contrainte.');
    case '22P02': // invalid_text_representation (ex: uuid mal forme)
      return new AppError(400, 'INVALID_INPUT', 'Identifiant invalide.');
    default:
      return null;
  }
}

export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (res.headersSent) return;

  let appError: AppError | null = null;

  if (error instanceof AppError) {
    appError = error;
  } else if (error instanceof ZodError) {
    appError = new AppError(422, 'VALIDATION_ERROR', 'Donnees invalides.', {
      issues: error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  } else if (error && typeof error === 'object' && 'status' in error && 'code' in error) {
    const candidate = error as { status: number; code: string; message: string };
    appError = new AppError(candidate.status, candidate.code, candidate.message);
  } else if (error && typeof error === 'object') {
    appError = translateDatabaseError(error as PgLikeError);
  }

  if (!appError) {
    logger.error('[api] erreur non geree', error);
    appError = AppError.internal();
  }

  if (appError.status >= 500 && !isProduction) {
    logger.error(`[api] ${req.method} ${req.originalUrl}`, error);
  }

  res.status(appError.status).json({
    error: {
      code: appError.code,
      message: appError.message,
      ...(appError.details ? { details: appError.details } : {}),
    },
  });
}
