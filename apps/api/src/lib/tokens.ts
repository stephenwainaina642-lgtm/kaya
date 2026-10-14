import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { Role } from '@kaya/shared';
import { env } from '../config/env';

export interface AccessTokenPayload {
  sub: string;
  organizationId: string;
  role: Role;
  name: string;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: '15m' });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
}

export interface PlatformTokenPayload {
  sub: string;
  email: string;
  name: string;
}

export function signPlatformToken(payload: PlatformTokenPayload): string {
  return jwt.sign(payload, env.PLATFORM_JWT_SECRET, { expiresIn: '12h' });
}

export function verifyPlatformToken(token: string): PlatformTokenPayload {
  return jwt.verify(token, env.PLATFORM_JWT_SECRET) as PlatformTokenPayload;
}

export function newRefreshToken(): string {
  return crypto.randomBytes(48).toString('hex');
}

export function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
