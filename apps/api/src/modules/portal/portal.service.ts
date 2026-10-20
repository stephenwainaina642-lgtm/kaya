import { z } from 'zod';
import { eq, and, desc, sql as dsql } from 'drizzle-orm';
import type { ViewingRequest, Page } from '@kaya/shared';
import { withTenant } from '../../db/client';
import { systemDb } from '../../db/system';
import {
  viewingRequests, documents, documentSignatures, properties, clients, users,
} from '../../db/schema';
import { resolveShareToken } from '../shortlists/shortlists.service';
import { createViewing } from '../viewings/viewings.service';
import { notFound, invalid } from '../../lib/errors';
import { parse } from '../../lib/validate';
import { type Auth, uuidField, pagingQuery, pageWindow, agentRef } from '../crm/common';
import { recordAudit } from '../../lib/audit';

// --- Public (no-auth, behind the share token) ---

export const viewingRequestPublicInput = z.object({
  propertyId: uuidField,
  preferredAt: z.string().datetime({ offset: true }),
  notes: z.string().trim().max(1000).nullable().optional(),
});

/** A client asking, through their portal link, for a viewing at a time of their choosing.
 * Creates a PENDING request only — see respondToViewingRequest for how staff turn it into
 * a real scheduled viewing. */
export async function createPublicViewingRequest(token: string, body: unknown): Promise<void> {
  const input = parse(viewingRequestPublicInput, body);
  const shortlist = await resolveShareToken(token);

  const [property] = await systemDb.select({ id: properties.id }).from(properties)
    .where(and(eq(properties.id, input.propertyId), eq(properties.organizationId, shortlist.organizationId)));
  if (!property) throw notFound('Property');

  const preferredAt = new Date(input.preferredAt);
  if (preferredAt.getTime() < Date.now()) throw invalid({ preferredAt: 'Pick a time in the future' });

  await systemDb.insert(viewingRequests).values({
    organizationId: shortlist.organizationId,
    clientId: shortlist.clientId,
    propertyId: input.propertyId,
    shortlistId: shortlist.id,
    preferredAt,
    notes: input.notes ?? null,
  });
}

/** Resolves and verifies a document belongs to the token's client before the portal
 * is allowed to read or sign it — the share token is the only credential a client has. */
async function requirePortalDocument(token: string, documentId: string) {
  const shortlist = await resolveShareToken(token);
  const [doc] = await systemDb.select().from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.organizationId, shortlist.organizationId), eq(documents.clientId, shortlist.clientId)));
  if (!doc) throw notFound('Document');
  return doc;
}

export async function getPortalDocumentFile(token: string, documentId: string) {
  return requirePortalDocument(token, documentId);
}

export const signDocumentInput = z.object({
  signerName: z.string().trim().min(1).max(200),
  signatureDataUrl: z.string().startsWith('data:image/', { message: 'Expected a drawn signature' }).max(500_000),
});

/** Records a lightweight, portal-captured signature — NOT a legally-binding e-signature
 * (no identity verification). One per document; re-signing an already-signed document
 * is rejected rather than silently overwriting a prior agreement. */
export async function signPortalDocument(token: string, documentId: string, body: unknown, ipAddress: string | null): Promise<void> {
  const input = parse(signDocumentInput, body);
  const doc = await requirePortalDocument(token, documentId);
  if (!doc.requiresSignature) throw invalid({ documentId: 'This document does not require a signature' });

  const [existing] = await systemDb.select({ id: documentSignatures.id }).from(documentSignatures).where(eq(documentSignatures.documentId, documentId));
  if (existing) throw invalid({ documentId: 'This document has already been signed' });

  await systemDb.insert(documentSignatures).values({
    organizationId: doc.organizationId,
    documentId,
    signerName: input.signerName,
    signatureDataUrl: input.signatureDataUrl,
    ipAddress,
  });
}

// --- Staff (authenticated) ---

export const viewingRequestListQuery = pagingQuery.extend({
  status: z.enum(['PENDING', 'CONFIRMED', 'DECLINED']).optional(),
});

async function hydrateViewingRequest(row: {
  vr: typeof viewingRequests.$inferSelect;
  clientName: string;
  propertyTitle: string;
  responderName: string | null;
}): Promise<ViewingRequest> {
  return {
    id: row.vr.id,
    clientName: row.clientName,
    propertyTitle: row.propertyTitle,
    propertyId: row.vr.propertyId,
    preferredAt: row.vr.preferredAt.toISOString(),
    notes: row.vr.notes,
    status: row.vr.status,
    viewingId: row.vr.viewingId,
    respondedBy: agentRef(row.vr.respondedById, row.responderName),
    respondedAt: row.vr.respondedAt?.toISOString() ?? null,
    responseNote: row.vr.responseNote,
    createdAt: row.vr.createdAt.toISOString(),
  };
}

export async function listViewingRequests(a: Auth, query: unknown): Promise<Page<ViewingRequest>> {
  const q = parse(viewingRequestListQuery, query);
  return withTenant(a.organizationId, async (tx) => {
    const conds = [eq(viewingRequests.organizationId, a.organizationId)];
    if (q.status) conds.push(eq(viewingRequests.status, q.status));
    const where = and(...conds);
    const { limit, offset } = pageWindow(q);

    const responders = users;
    const [rows, [totalRow]] = await Promise.all([
      tx.select({
        vr: viewingRequests,
        clientName: clients.fullName,
        propertyTitle: properties.title,
        responderName: responders.name,
      })
        .from(viewingRequests)
        .innerJoin(clients, eq(clients.id, viewingRequests.clientId))
        .innerJoin(properties, eq(properties.id, viewingRequests.propertyId))
        .leftJoin(responders, eq(responders.id, viewingRequests.respondedById))
        .where(where)
        .orderBy(desc(viewingRequests.createdAt))
        .limit(limit).offset(offset),
      tx.select({ c: dsql<number>`count(*)::int` }).from(viewingRequests).where(where),
    ]);

    return {
      items: await Promise.all(rows.map(hydrateViewingRequest)),
      total: totalRow?.c ?? rows.length,
      page: q.page,
      pageSize: q.pageSize,
    };
  });
}

export const viewingRequestDecisionInput = z.object({
  responseNote: z.string().trim().max(500).nullable().optional(),
  agentId: uuidField.nullable().optional(),
  durationMinutes: z.number().int().min(10).max(480).default(30),
});

async function requireViewingRequest(a: Auth, id: string) {
  parse(uuidField, id);
  return withTenant(a.organizationId, async (tx) => {
    const [row] = await tx.select().from(viewingRequests).where(and(eq(viewingRequests.id, id), eq(viewingRequests.organizationId, a.organizationId)));
    if (!row) throw notFound('Viewing request');
    if (row.status !== 'PENDING') throw invalid({ status: 'This request has already been responded to' });
    return row;
  });
}

/** Confirms a client's requested viewing time by creating a real `viewings` row —
 * nothing is auto-scheduled without a staff member explicitly confirming it and
 * picking (or accepting the default) agent. */
export async function confirmViewingRequest(a: Auth, id: string, body: unknown): Promise<ViewingRequest> {
  const input = parse(viewingRequestDecisionInput, body);
  const request = await requireViewingRequest(a, id);

  // createViewing() opens its own transaction (it does real conflict-detection
  // and audit-logging work we want to reuse rather than duplicate), so this
  // isn't atomic with the status update below. The narrow failure window — a
  // real viewing gets created but the request stays PENDING if the second
  // transaction then fails — is a rare, visible inconsistency (the request
  // would simply show as still-pending and someone retries), not silent data
  // loss or a double-booking, so it's an acceptable trade-off for v1.
  const viewing = await createViewing(a, {
    propertyId: request.propertyId,
    clientId: request.clientId,
    agentId: input.agentId ?? a.userId,
    scheduledAt: request.preferredAt.toISOString(),
    durationMinutes: input.durationMinutes,
    notes: request.notes,
  });

  return withTenant(a.organizationId, async (tx) => {
    await tx.update(viewingRequests).set({
      status: 'CONFIRMED',
      viewingId: viewing.id,
      respondedById: a.userId,
      respondedAt: new Date(),
      responseNote: input.responseNote ?? null,
    }).where(eq(viewingRequests.id, id));

    await recordAudit(tx, {
      organizationId: a.organizationId, actorId: a.userId, action: 'UPDATE', entityType: 'viewing_request', entityId: id,
      summary: `Confirmed viewing request, scheduled viewing ${viewing.id}`,
    });

    const [row] = await tx.select({
      vr: viewingRequests,
      clientName: clients.fullName,
      propertyTitle: properties.title,
      responderName: users.name,
    })
      .from(viewingRequests)
      .innerJoin(clients, eq(clients.id, viewingRequests.clientId))
      .innerJoin(properties, eq(properties.id, viewingRequests.propertyId))
      .leftJoin(users, eq(users.id, viewingRequests.respondedById))
      .where(eq(viewingRequests.id, id));
    return hydrateViewingRequest(row!);
  });
}

export async function declineViewingRequest(a: Auth, id: string, body: unknown): Promise<void> {
  const input = parse(z.object({ responseNote: z.string().trim().max(500).nullable().optional() }), body);
  await requireViewingRequest(a, id);
  await withTenant(a.organizationId, async (tx) => {
    await tx.update(viewingRequests).set({
      status: 'DECLINED',
      respondedById: a.userId,
      respondedAt: new Date(),
      responseNote: input.responseNote ?? null,
    }).where(eq(viewingRequests.id, id));

    await recordAudit(tx, {
      organizationId: a.organizationId, actorId: a.userId, action: 'UPDATE', entityType: 'viewing_request', entityId: id,
      summary: 'Declined viewing request',
    });
  });
}
