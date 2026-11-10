import crypto from 'node:crypto';
import { env } from '../config/env';

// Encrypts per-agency credentials (e.g. their M-Pesa keys) at rest with AES-256-GCM. Set SECRETS_KEY to a long
// random string; without it the key is derived from JWT_ACCESS_SECRET, so rotating that secret would make stored
// credentials unreadable (the agency would just re-enter them).
const key = () => crypto.createHash('sha256').update(`kaya-secrets:v1:${env.SECRETS_KEY ?? env.JWT_ACCESS_SECRET}`).digest();

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return `v1.${iv.toString('base64url')}.${c.getAuthTag().toString('base64url')}.${enc.toString('base64url')}`;
}

export function decryptSecret(blob: string): string | null {
  try {
    const [v, iv, tag, data] = blob.split('.');
    if (v !== 'v1' || !iv || !tag || !data) return null;
    const d = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
    d.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([d.update(Buffer.from(data, 'base64url')), d.final()]).toString('utf8');
  } catch {
    return null;
  }
}
