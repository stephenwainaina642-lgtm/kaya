import type { NextFunction, Request, Response } from 'express';
import { MulterError } from 'multer';
import { AppError } from '../lib/errors';

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    return;
  }
  if (err instanceof MulterError && err.code === 'LIMIT_FILE_SIZE') {
    res.status(422).json({ error: { code: 'VALIDATION_FAILED', message: 'File too large' } });
    return;
  }
  req.log?.error({ err }, 'unhandled error');
  // TEMP: surface the real error message/stack in the response body while
  // we're bringing the Render deploy up — there's no other practical way
  // to see server errors on Render's free tier (no shell, slow/awkward log
  // search). Safe for now: this is pre-launch demo data, not real tenant
  // data. Revert to the generic message before onboarding real customers.
  const debugMessage = err instanceof Error ? err.message : String(err);
  const debugStack = err instanceof Error ? err.stack : undefined;
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Something went wrong', debugMessage, debugStack },
  });
}
