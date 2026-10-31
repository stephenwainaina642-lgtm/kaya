import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import type { Readable } from 'node:stream';
import type { Response } from 'express';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { env } from '../config/env';
import { notFound } from './errors';

// Two interchangeable backends behind one interface, chosen by config:
//  - S3-compatible bucket (Cloudflare R2, AWS S3, ...) when S3_BUCKET and
//    credentials are set — durable, survives redeploys. Use this in production.
//  - Local disk otherwise — fine for development and tests, but ephemeral
//    on hosts like Render, so uploads vanish on every deploy.
// Storage keys are identical in both, so switching backend later is a copy
// of the files, not a data migration.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORAGE_ROOT = path.resolve(__dirname, '../../.storage');

let s3: S3Client | null = null;
function s3Client(): S3Client | null {
  if (!env.S3_BUCKET || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) return null;
  s3 ??= new S3Client({
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT,
    credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
  });
  return s3;
}

export function storageBackend(): 's3' | 'local' {
  return s3Client() ? 's3' : 'local';
}

function keyPath(storageKey: string): string {
  return path.join(STORAGE_ROOT, storageKey);
}

export async function saveFile(organizationId: string, buffer: Buffer): Promise<string> {
  const storageKey = path.posix.join(organizationId, `${crypto.randomUUID()}.bin`);
  const client = s3Client();
  if (client) {
    await client.send(new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: storageKey, Body: buffer }));
    return storageKey;
  }
  const dest = keyPath(storageKey);
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  await fsp.writeFile(dest, buffer);
  return storageKey;
}

export async function readFile(storageKey: string): Promise<Readable> {
  const client = s3Client();
  if (client) {
    try {
      const out = await client.send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: storageKey }));
      if (!out.Body) throw notFound('File');
      return out.Body as Readable;
    } catch (err) {
      if ((err as { name?: string }).name === 'NoSuchKey') throw notFound('File');
      throw err;
    }
  }
  const p = keyPath(storageKey);
  try {
    await fsp.access(p);
  } catch {
    throw notFound('File');
  }
  return fs.createReadStream(p);
}

/** Streams a stored file into a response; a missing file becomes a clean 404 rather than a hung request. */
export async function sendFile(storageKey: string, res: Response): Promise<void> {
  const stream = await readFile(storageKey);
  stream.on('error', () => res.destroy());
  stream.pipe(res);
}

export async function deleteFile(storageKey: string): Promise<void> {
  const client = s3Client();
  if (client) {
    await client.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: storageKey }));
    return;
  }
  await fsp.rm(keyPath(storageKey), { force: true });
}
