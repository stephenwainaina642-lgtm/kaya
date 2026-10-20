import { pgTable, text, timestamp, uuid, pgEnum } from 'drizzle-orm/pg-core';
import { timestamps } from './base';
import { tenantColumns } from './tenant-ref';
import { users } from './identity';
import { clients } from './crm';
import { properties, clientShortlists } from './properties';
import { viewings } from './sales';
import { documents } from './ops';

export const viewingRequestStatusEnum = pgEnum('viewing_request_status', ['PENDING', 'CONFIRMED', 'DECLINED']);

/**
 * A viewing time a client asked for through their self-service portal (the
 * same share link as their shortlist — see modules/portal). Confirming one
 * creates a real `viewings` row (see portal.service.ts respondToViewingRequest);
 * it's never auto-scheduled, since a real agent still needs to be available
 * at that time.
 */
export const viewingRequests = pgTable('viewing_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  ...tenantColumns(),
  clientId: uuid('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  propertyId: uuid('property_id').notNull().references(() => properties.id, { onDelete: 'cascade' }),
  shortlistId: uuid('shortlist_id').references(() => clientShortlists.id, { onDelete: 'set null' }),
  preferredAt: timestamp('preferred_at', { withTimezone: true }).notNull(),
  notes: text('notes'),
  status: viewingRequestStatusEnum('status').notNull().default('PENDING'),
  viewingId: uuid('viewing_id').references(() => viewings.id, { onDelete: 'set null' }),
  respondedById: uuid('responded_by_id').references(() => users.id, { onDelete: 'set null' }),
  respondedAt: timestamp('responded_at', { withTimezone: true }),
  responseNote: text('response_note'),
  ...timestamps(),
});

/**
 * A lightweight, portal-captured signature on a document — explicitly NOT a
 * legally-binding e-signature (see the comment on documents.requiresSignature).
 * One signature per document: once signed, the portal shows it as signed
 * rather than allowing a re-sign, since this is a record of agreement, not
 * a versioned workflow.
 */
export const documentSignatures = pgTable('document_signatures', {
  id: uuid('id').primaryKey().defaultRandom(),
  ...tenantColumns(),
  documentId: uuid('document_id').notNull().unique().references(() => documents.id, { onDelete: 'cascade' }),
  signerName: text('signer_name').notNull(),
  // A data: URL PNG from the portal's canvas signature pad.
  signatureDataUrl: text('signature_data_url').notNull(),
  ipAddress: text('ip_address'),
  signedAt: timestamp('signed_at', { withTimezone: true }).notNull().defaultNow(),
});
