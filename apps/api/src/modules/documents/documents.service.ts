import { z } from 'zod';
import { and, eq, desc, sql as dsql } from 'drizzle-orm';
import { DOCUMENT_TYPES } from '@kaya/shared';
import type { DocumentItem, DocumentPage } from '@kaya/shared';
import { withTenant, type Tx } from '../../db/client';
import { documents, users } from '../../db/schema';
import { type Auth, pagingQuery, pageWindow, uuidField } from '../crm/common';
import { notFound, invalid } from '../../lib/errors';
import { saveFile, deleteFile } from '../../lib/storage';
import { recordAudit } from '../../lib/audit';

export const documentUploadMeta = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  type: z.enum(DOCUMENT_TYPES).default('OTHER'),
  clientId: uuidField.nullable().optional(),
  propertyId: uuidField.nullable().optional(),
  ownerId: uuidField.nullable().optional(),
  dealId: uuidField.nullable().optional(),
});

export const documentsQuery = pagingQuery.extend({
  clientId: uuidField.optional(),
  propertyId: uuidField.optional(),
  ownerId: uuidField.optional(),
  dealId: uuidField.optional(),
  type: z.enum(DOCUMENT_TYPES).optional(),
});

function toItem(row: { d: typeof documents.$inferSelect; uploaderName: string | null }): DocumentItem {
  return {
    id: row.d.id,
    name: row.d.name,
    type: row.d.type,
    mimeType: row.d.mimeType,
    sizeBytes: row.d.sizeBytes,
    links: {
      clientId: row.d.clientId,
      propertyId: row.d.propertyId,
      ownerId: row.d.ownerId,
      dealId: row.d.dealId,
    },
    uploadedBy: row.d.uploadedById ? { id: row.d.uploadedById, name: row.uploaderName ?? 'User' } : null,
    createdAt: row.d.createdAt.toISOString(),
  };
}

// Shared by uploadDocument (inside its own transaction) and getDocument (its own transaction),
// so neither has to call the other and open a second, independently-committed transaction.
async function hydrate(tx: Tx, organizationId: string, id: string): Promise<DocumentItem> {
  const [row] = await tx
    .select({ d: documents, uploaderName: users.name })
    .from(documents)
    .leftJoin(users, eq(users.id, documents.uploadedById))
    .where(and(eq(documents.id, id), eq(documents.organizationId, organizationId)));
  if (!row) throw notFound('Document');
  return toItem(row);
}

export async function listDocuments(a: Auth, q: z.infer<typeof documentsQuery>): Promise<DocumentPage> {
  return withTenant(a.organizationId, async (tx) => {
    const { limit, offset } = pageWindow(q);
    const conditions = [eq(documents.organizationId, a.organizationId)];
    if (q.clientId) conditions.push(eq(documents.clientId, q.clientId));
    if (q.propertyId) conditions.push(eq(documents.propertyId, q.propertyId));
    if (q.ownerId) conditions.push(eq(documents.ownerId, q.ownerId));
    if (q.dealId) conditions.push(eq(documents.dealId, q.dealId));
    if (q.type) conditions.push(eq(documents.type, q.type));

    const rows = await tx
      .select({ d: documents, uploaderName: users.name })
      .from(documents)
      .leftJoin(users, eq(users.id, documents.uploadedById))
      .where(and(...conditions))
      .orderBy(desc(documents.createdAt))
      .limit(limit)
      .offset(offset);

    const [totalRow] = await tx.select({ c: dsql<number>`count(*)::int` }).from(documents).where(and(...conditions));

    return { items: rows.map(toItem), total: totalRow?.c ?? rows.length };
  });
}

export async function getDocument(a: Auth, id: string): Promise<DocumentItem> {
  return withTenant(a.organizationId, (tx) => hydrate(tx, a.organizationId, id));
}

export async function uploadDocument(
  a: Auth,
  file: { buffer: Buffer; mimetype: string; size: number; originalname: string },
  meta: z.infer<typeof documentUploadMeta>,
): Promise<DocumentItem> {
  if (!meta.clientId && !meta.propertyId && !meta.ownerId && !meta.dealId) {
    throw invalid({ clientId: 'at least one link (client, property, owner or deal) is required' });
  }

  const storageKey = await saveFile(a.organizationId, file.buffer);

  try {
    return await withTenant(a.organizationId, async (tx) => {
      const [row] = await tx
        .insert(documents)
        .values({
          organizationId: a.organizationId,
          name: meta.name?.trim() || file.originalname,
          type: meta.type,
          mimeType: file.mimetype,
          sizeBytes: file.size,
          storageKey,
          clientId: meta.clientId ?? null,
          propertyId: meta.propertyId ?? null,
          ownerId: meta.ownerId ?? null,
          dealId: meta.dealId ?? null,
          uploadedById: a.userId,
        })
        .returning();
      if (!row) throw notFound('Document');

      await recordAudit(tx, {
        organizationId: a.organizationId,
        actorId: a.userId,
        action: 'DOCUMENT_UPLOADED',
        entityType: 'document',
        entityId: row.id,
        after: { name: row.name, type: row.type },
        summary: `Uploaded document ${row.name}`,
      });

      // hydrate within the SAME transaction — not a fresh call to getDocument(), which would
      // open an independent transaction that cannot see this still-uncommitted insert.
      return hydrate(tx, a.organizationId, row.id);
    });
  } catch (err) {
    await deleteFile(storageKey).catch(() => undefined);
    throw err;
  }
}

export async function deleteDocument(a: Auth, id: string): Promise<void> {
  const storageKey = await withTenant(a.organizationId, async (tx) => {
    const [row] = await tx
      .select({ storageKey: documents.storageKey })
      .from(documents)
      .where(and(eq(documents.id, id), eq(documents.organizationId, a.organizationId)));
    if (!row) throw notFound('Document');

    await tx.delete(documents).where(and(eq(documents.id, id), eq(documents.organizationId, a.organizationId)));

    await recordAudit(tx, {
      organizationId: a.organizationId,
      actorId: a.userId,
      action: 'DOCUMENT_DELETED',
      entityType: 'document',
      entityId: id,
      summary: 'Deleted document',
    });

    return row.storageKey;
  });

  await deleteFile(storageKey).catch(() => undefined);
}

export async function readDocumentFile(a: Auth, id: string) {
  return withTenant(a.organizationId, async (tx) => {
    const [row] = await tx
      .select()
      .from(documents)
      .where(and(eq(documents.id, id), eq(documents.organizationId, a.organizationId)));
    if (!row) throw notFound('Document');
    return row;
  });
}
