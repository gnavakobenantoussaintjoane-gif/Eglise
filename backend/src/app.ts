import path from 'node:path';
import { existsSync } from 'node:fs';
import express, { type Express, type RequestHandler } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env, corsOrigins, isProduction, repoRoot } from './config/env.js';
import { errorHandler, notFoundHandler } from './middlewares/error.js';
import { loadAuthContext } from './middlewares/auth.js';
import { globalLimiter } from './middlewares/rateLimit.js';
import { AppError } from './utils/errors.js';
import { authRouter } from './modules/auth/routes.js';
import { publicRouter } from './modules/public/routes.js';
import { membersRouter } from './modules/members/routes.js';
import { mediaRouter } from './modules/gallery/routes.js';
import { adminRouter } from './modules/admin/routes.js';
import { filesRouter } from './modules/files/routes.js';
import { getDatabase } from './db/client.js';

export function isOriginAllowed(origin: string, requestHost: string | undefined): boolean {
  if (corsOrigins.includes(origin)) return true;
  try {
    const url = new URL(origin);
    if (requestHost && url.host === requestHost) return true;
    // Previews Arena (*.e2b.app) et environnements de test locaux.
    if (/\.e2b\.app$/.test(url.hostname)) return true;
    if (!isProduction && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return true;
    return false;
  } catch {
    return false;
  }
}

/** Refuse les mutations cross-site (defense CSRF complementaire a SameSite=Lax). */
const originGuard: RequestHandler = (req, _res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.headers.origin;
  if (!origin) return next(); // clients non navigateur (curl, tests, webhooks)
  if (isOriginAllowed(origin, req.headers.host)) return next();
  return next(AppError.forbidden('Origine non autorisee pour cette operation.'));
};

export function createApp(): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: isProduction
        ? {
            directives: {
              defaultSrc: ["'self'"],
              imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
              scriptSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
              fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
              connectSrc: ["'self'"],
              objectSrc: ["'none'"],
              frameAncestors: ["'self'"],
            },
          }
        : false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      crossOriginEmbedderPolicy: false,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  );

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin) return callback(null, true);
        return callback(null, isOriginAllowed(origin, undefined));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
      maxAge: 600,
    }),
  );

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));
  app.use(cookieParser());
  app.use(globalLimiter);
  app.use(originGuard);

  const api = express.Router();
  api.use(loadAuthContext);
  api.get('/health', async (_req, res) => {
    const db = getDatabase();
    try {
      await db.query('select 1');
      res.json({ status: 'ok', database: db.driver, storage: env.STORAGE_DRIVER });
    } catch {
      res.status(503).json({ status: 'degraded', database: 'unreachable' });
    }
  });
  api.use('/auth', authRouter);
  api.use('/public', publicRouter);
  api.use('/members', membersRouter);
  api.use('/admin', adminRouter);
  api.use('/media', mediaRouter);

  app.use(env.API_PREFIX, api);
  // Fichiers signes : l'URL complete est generee par signFileUrl() et inclut
  // le prefixe API (PUBLIC_API_URL). Le routeur est donc monte sous ce prefixe.
  app.use(`${env.API_PREFIX}/files`, filesRouter);

  // Sert le frontend compile en production (deploiement mono-service).
  const frontendDist = path.resolve(repoRoot, 'frontend/dist');
  if (isProduction && existsSync(frontendDist)) {
    app.use(
      express.static(frontendDist, {
        index: false,
        maxAge: '1h',
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('index.html')) res.setHeader('Cache-Control', 'no-store');
        },
      }),
    );
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/files') || req.path.startsWith(env.API_PREFIX)) return next();
      res.sendFile(path.join(frontendDist, 'index.html'));
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
