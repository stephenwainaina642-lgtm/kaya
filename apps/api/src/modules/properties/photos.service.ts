import crypto from 'node:crypto';
import { and, eq, inArray, sql as dsql } from 'drizzle-orm';
import type { Response } from 'express';
import { withTenant } from '../../db/client';
import { systemDb } from '../../db/system';
import { properties, propertyImages } from '../../db/schema';
import { invalid, notFound } from '../../lib/errors';
import { saveFile, sendFile, deleteFile } from '../../lib/storage';
import { type Auth } from '../crm/common';

export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
export const MAX_PHOTOS_PER_UPLOAD = 10;

/** Identify the real image type from the bytes; the filename and declared type are never trusted. */
export function sniffImage(b: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (b.length > 12 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length > 12 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (b.length > 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}

type Upload = { buffer: Buffer; originalname?: string };

/**
 * Stores each photo once and attaches it to every listed property (a whole building's worth of units
 * shares one stored file). The first photo a unit receives becomes its cover.
 */
export async function addPhotos(a: Auth, propertyIds: string[], files: Upload[]): Promise<{ units: number; photos: number }> {
  if (files.length === 0) throw invalid({ files: 'Choose at least one photo.' });
  if (files.length > MAX_PHOTOS_PER_UPLOAD) throw invalid({ files: `Upload at most ${MAX_PHOTOS_PER_UPLOAD} photos at a time.` });
  const typed = files.map((f) => {
    const mime = sniffImage(f.buffer);
    if (!mime) throw invalid({ files: `${f.originalname ?? 'A file'} is not a JPG, PNG or WebP image.` });
    if (f.buffer.length > MAX_PHOTO_BYTES) throw invalid({ files: `${f.originalname ?? 'A photo'} is over 8 MB.` });
    return { buffer: f.buffer, mime };
  });
  if (propertyIds.length === 0) throw notFound('Units');

  return withTenant(a.organizationId, async (tx) => {
    const owned = await tx.select({ id: properties.id }).from(properties)
      .where(and(eq(properties.organizationId, a.organizationId), inArray(properties.id, propertyIds)));
    if (owned.length !== new Set(propertyIds).size) throw notFound('Property');

    const stored = [];
    for (const f of typed) stored.push({ ...f, key: await saveFile(a.organizationId, f.buffer) });

    const counts = await tx.select({ id: propertyImages.propertyId, n: dsql<number>`count(*)::int`, cover: dsql<boolean>`bool_or(${propertyImages.isCover})` })
      .from(propertyImages).where(inArray(propertyImages.propertyId, propertyIds)).groupBy(propertyImages.propertyId);
    const have = new Map(counts.map((c) => [c.id, c]));

    const rows = [];
    for (const pid of propertyIds) {
      let pos = have.get(pid)?.n ?? 0;
      let hasCover = have.get(pid)?.cover ?? false;
      for (const s of stored) {
        const id = crypto.randomUUID();
        rows.push({ id, propertyId: pid, url: `/api/public/photos/${id}`, storageKey: s.key, mime: s.mime, isCover: !hasCover, position: pos++ });
        hasCover = true;
      }
    }
    for (let i = 0; i < rows.length; i += 500) await tx.insert(propertyImages).values(rows.slice(i, i + 500));
    return { units: propertyIds.length, photos: stored.length };
  });
}

/** Removes the stored bytes once no property image still points at them. */
export async function releaseFile(storageKey: string | null): Promise<void> {
  if (!storageKey) return;
  const [still] = await systemDb.select({ id: propertyImages.id }).from(propertyImages).where(eq(propertyImages.storageKey, storageKey)).limit(1);
  if (!still) await deleteFile(storageKey).catch(() => undefined);
}

/** Public: photos are referenced by an unguessable id, the same way listing links are. */
export async function servePhoto(id: string, res: Response): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound('Photo');
  const [row] = await systemDb.select({ key: propertyImages.storageKey, mime: propertyImages.mime }).from(propertyImages).where(eq(propertyImages.id, id));
  if (!row?.key || !row.mime) throw notFound('Photo');
  res.setHeader('Content-Type', row.mime);
  res.setHeader('Cache-Control', 'public, max-age=86400');
  await sendFile(row.key, res);
}
