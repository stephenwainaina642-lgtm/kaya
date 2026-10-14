import type { NextFunction, Request, Response } from 'express';
import { verifyPlatformToken, type PlatformTokenPayload } from '../lib/tokens';
import { unauthorized } from '../lib/errors';

export interface PlatformAuthContext {
  adminId: string;
  email: string;
  name: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      platformAuth?: PlatformAuthContext;
    }
  }
}

export function authenticatePlatform(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next(unauthorized('Missing access token'));
    return;
  }
  try {
    const payload: PlatformTokenPayload = verifyPlatformToken(header.slice('Bearer '.length));
    req.platformAuth = { adminId: payload.sub, email: payload.email, name: payload.name };
    next();
  } catch {
    next(unauthorized('Invalid or expired access token'));
  }
}

export function platformCtx(req: Request): PlatformAuthContext {
  if (!req.platformAuth) throw unauthorized();
  return req.platformAuth;
}
