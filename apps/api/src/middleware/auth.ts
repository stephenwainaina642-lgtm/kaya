import type { NextFunction, Request, Response } from 'express';
import type { Permission } from '@kaya/shared';
import { can } from '@kaya/shared';
import { verifyAccessToken, type AccessTokenPayload } from '../lib/tokens';
import { unauthorized, forbidden } from '../lib/errors';

export interface AuthContext {
  userId: string;
  organizationId: string;
  role: AccessTokenPayload['role'];
  name: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next(unauthorized('Missing access token'));
    return;
  }
  try {
    const payload = verifyAccessToken(header.slice('Bearer '.length));
    req.auth = {
      userId: payload.sub,
      organizationId: payload.organizationId,
      role: payload.role,
      name: payload.name,
    };
    next();
  } catch {
    next(unauthorized('Invalid or expired access token'));
  }
}

export function requirePermission(permission: Permission) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const a = req.auth;
    if (!a) {
      next(unauthorized());
      return;
    }
    if (!can(a.role, permission)) {
      next(forbidden());
      return;
    }
    next();
  };
}

export function ctx(req: Request): AuthContext {
  if (!req.auth) throw unauthorized();
  return req.auth;
}
