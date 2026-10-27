import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import type { RequestHandler } from 'express';
import { env, isTest } from '../config/env.js';

const message = {
  error: {
    code: 'RATE_LIMITED',
    message: 'Trop de tentatives. Patientez quelques minutes avant de reessayer.',
  },
};

function limiter(windowMs: number, max: number): RequestHandler {
  if (isTest) {
    // Les tests d'integration enchaisent les requetes : limites desactivees.
    return (_req, _res, next) => next();
  }
  return rateLimit({
    windowMs,
    limit: max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message,
    keyGenerator: (req) => req.auth?.profile.id ?? ipKeyGenerator(req.ip ?? '127.0.0.1'),
  });
}

export const globalLimiter = limiter(15 * 60 * 1000, env.NODE_ENV === 'production' ? 600 : 5000);
export const authLimiter = limiter(15 * 60 * 1000, 20);
export const publicWriteLimiter = limiter(60 * 60 * 1000, 20);
export const uploadLimiter = limiter(60 * 60 * 1000, 120);
