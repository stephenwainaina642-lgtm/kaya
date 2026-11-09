import type { NextFunction, Request, Response } from 'express';
import { MulterError } from 'multer';
import { AppError } from '../lib/errors';
import { captureError } from '../lib/monitoring';

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
  captureError(err, { method: req.method, path: req.path });
  // Temporary diagnostic switch: set EXPOSE_ERROR_DETAILS=true on the server to
  // see the real reason on screen instead of hunting through logs. It can reveal
  // table and column names, so leave it off except while debugging.
  const e = err as { name?: string; code?: string; message?: string };
  const message = process.env.EXPOSE_ERROR_DETAILS === 'true'
    ? `Something went wrong [${e.name ?? 'Error'}${e.code ? ` ${e.code}` : ''}]: ${String(e.message ?? err).slice(0, 300)}`
    : 'Something went wrong';
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message } });
}
