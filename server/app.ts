import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { APP_VERSION, getProviderCapabilities } from './config';
import { registerCallRoutes } from './routes/calls';
import { registerAnalysisRoutes } from './routes/analysis';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * Builds the Express application: observability headers, JSON API, then the
 * SPA (Vite middleware in dev, static build in production). The HTTP listener
 * and shutdown handling live in the entry point so the app stays testable.
 */
export async function createApp(): Promise<Express> {
  const app = express();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 },
  });

  app.disable('x-powered-by');
  app.use((req, res, next) => {
    const requestId = req.get('x-request-id') || randomUUID();
    res.setHeader('X-Request-Id', requestId);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), geolocation=(), microphone=(self)');
    next();
  });

  // Structured request log with latency, excluding routine asset traffic.
  app.use((req, res, next) => {
    if (!req.path.startsWith('/api')) {
      next();
      return;
    }
    const startedAt = performance.now();
    res.on('finish', () => {
      const elapsedMs = Math.round(performance.now() - startedAt);
      const line = `${req.method} ${req.originalUrl} ${res.statusCode} ${elapsedMs}ms`;
      if (res.statusCode >= 500) {
        console.error(line);
      } else {
        console.info(line);
      }
    });
    next();
  });

  // API responses are dynamic; never let intermediaries cache them.
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  app.use(express.json({ limit: '30mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      uptimeSec: Math.round(process.uptime()),
      version: APP_VERSION,
      provider: getProviderCapabilities().llmProvider,
    });
  });

  app.get('/api/capabilities', (_req, res) => {
    res.json(getProviderCapabilities());
  });

  registerCallRoutes(app);
  registerAnalysisRoutes(app, upload);

  app.use('/api', (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const status =
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code?: string }).code === 'LIMIT_FILE_SIZE'
        ? 413
        : 400;
    const message =
      status === 413
        ? 'Audio file exceeds the 25 MB upload limit.'
        : err instanceof Error
          ? err.message
          : 'Invalid API request.';
    res.status(status).json({ error: message });
  });

  // Unknown API routes must return JSON instead of the SPA fallback.
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API route not found.' });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(moduleDir, '..', 'dist');
    // Hashed build assets are safe to cache for a year.
    app.use(
      '/assets',
      express.static(path.join(distPath, 'assets'), { immutable: true, maxAge: '1y' })
    );
    app.use(express.static(distPath, { index: false }));
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  return app;
}
